import { requireAdmin } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { deleteCard, payCardInvoice, saveCard } from "@/finance/actions";
import { listBanks, listCardCharges, listCards } from "@/finance/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { FinanceNav } from "@/ui/finance-nav";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function CardsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; cartao?: string }>;
}) {
  const user = await requireAdmin();
  const query = await searchParams;
  const cards = await listCards(user.accountId);
  const banks = await listBanks(user.accountId);
  const selected = cards.find((card) => card.id === query.cartao) ?? cards[0] ?? null;
  const charges = selected ? await listCardCharges(user.accountId, selected.id) : [];

  return (
    <Panel user={user} current="/financeiro" title="Cartões">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <FinanceNav current="cartoes" />
      <form action={saveCard}>
        <div className="split">
          <label>
            Nome
            <input name="name" required />
          </label>
          <label>
            Instituição
            <input name="institution" placeholder="Nubank, Itaú, Cielo" />
          </label>
          <label>
            Limite
            <input name="limit" placeholder="0,00" />
          </label>
          <label>
            Fecha no dia
            <input name="closing" type="number" min={1} max={31} defaultValue={1} required />
          </label>
          <label>
            Vence no dia
            <input name="due" type="number" min={1} max={31} defaultValue={10} required />
          </label>
        </div>
        <SubmitButton label="Salvar cartão" pendingLabel="Salvando…" />
      </form>
      <div className="card">
        <h2>Cartões</h2>
        {cards.length === 0 ? <p>Nenhum cartão ainda.</p> : null}
        {cards.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Instituição</th>
                <th>Fecha</th>
                <th>Vence</th>
                <th>Limite</th>
                <th>Fatura</th>
                <th>Disponível</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cards.map((card) => (
                <tr key={card.id}>
                  <td>{card.name}</td>
                  <td>{card.institution ?? ""}</td>
                  <td>{card.closingDay}</td>
                  <td>{card.dueDay}</td>
                  <td>{formatReais(card.limitCents)}</td>
                  <td>{formatReais(card.openCents)}</td>
                  <td>{formatReais(card.limitCents - card.openCents)}</td>
                  <td>
                    <form action={deleteCard}>
                      <input type="hidden" name="id" value={card.id} />
                      <SubmitButton label="Excluir" pendingLabel="Excluindo…" className="quiet" />
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      {selected ? (
        <div className="card">
          <h2>Fatura · {selected.name}</h2>
          {charges.length === 0 ? <p>Nenhum lançamento nesta fatura.</p> : null}
          {charges.length > 0 ? (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Fornecedor</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.map((charge) => (
                    <tr key={charge.id}>
                      <td>{charge.paid}</td>
                      <td>{charge.description}</td>
                      <td>{charge.partyName}</td>
                      <td>{formatReais(charge.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {banks.length === 0 ? <p>Cadastre um banco para pagar a fatura.</p> : null}
              {banks.length > 0 ? (
                <form action={payCardInvoice}>
                  <input type="hidden" name="card" value={selected.id} />
                  <div className="split">
                    <label>
                      Banco
                      <select name="bank" defaultValue={banks[0]?.id}>
                        {banks.map((bank) => (
                          <option key={bank.id} value={bank.id}>
                            {bank.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Data
                      <input type="date" name="day" required defaultValue={todaySaoPaulo()} />
                    </label>
                  </div>
                  <p>Paga os {formatReais(selected.openCents)} em aberto. Esse valor sai do banco.</p>
                  <SubmitButton label="Pagar fatura" pendingLabel="Pagando…" />
                </form>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
