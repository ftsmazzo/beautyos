import Link from "next/link";
import { requireAdmin } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { deleteCard, payCardInvoice, saveCard } from "@/finance/actions";
import { listBanks, listCardCharges, listCards } from "@/finance/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
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
    <Panel user={user} current="/financeiro/cartoes" title="Cartões">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <div className="desk">
      <div className="desk-bar">
        <Modal label="Novo cartão" title="Novo cartão" tone="teal">
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
        </Modal>
        {cards.map((card) => (
          <Link key={card.id} className={card.id === selected?.id ? "btn" : "btn quiet"} href={`/financeiro/cartoes?cartao=${card.id}`}>
            {card.name}
          </Link>
        ))}
        {selected ? (
          <>
            {selected.institution ? <span className="badge bg-secondary-lt">{selected.institution}</span> : null}
            <span className="badge bg-secondary-lt">Fecha dia {selected.closingDay}</span>
            <span className="badge bg-secondary-lt">Vence dia {selected.dueDay}</span>
            <span className="badge bg-secondary-lt">Limite {formatReais(selected.limitCents)}</span>
            <span className="badge bg-secondary-lt">Disponível {formatReais(selected.limitCents - selected.openCents)}</span>
            <span className="badge bg-secondary-lt">Fatura {formatReais(selected.openCents)}</span>
            {selected.openCents > 0 && banks.length > 0 ? (
              <Modal label="Pagar fatura" title={`Pagar · ${selected.name}`} tone="teal">
                <form action={payCardInvoice}>
                  <input type="hidden" name="card" value={selected.id} />
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
                  <SubmitButton label={`Pagar ${formatReais(selected.openCents)}`} pendingLabel="Pagando…" />
                </form>
              </Modal>
            ) : null}
            <form action={deleteCard}>
              <input type="hidden" name="id" value={selected.id} />
              <SubmitButton label="Excluir" pendingLabel="Excluindo…" className="btn btn-outline" />
            </form>
          </>
        ) : null}
      </div>
      {selected ? (
        <div className="queue" style={{ overflowX: "auto" }}>
          {charges.length === 0 ? <p className="queue-empty">Nenhum lançamento nesta fatura.</p> : null}
          {charges.length > 0 ? (
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
          ) : null}
          {selected.openCents > 0 && banks.length === 0 ? <p className="queue-empty">Cadastre um banco para pagar a fatura.</p> : null}
        </div>
      ) : (
        <p className="queue-empty">Nenhum cartão ainda.</p>
      )}
      </div>
    </Panel>
  );
}
