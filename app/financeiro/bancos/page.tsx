import Link from "next/link";
import { requireAdmin } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { deleteBank, saveBank } from "@/finance/actions";
import { listBankLines, listBanks } from "@/finance/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const KINDS: Record<string, string> = {
  corrente: "Corrente",
  poupanca: "Poupança",
  outro: "Outro",
};

export default async function BanksPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; banco?: string }>;
}) {
  const user = await requireAdmin();
  const query = await searchParams;
  const banks = await listBanks(user.accountId);
  const selected = banks.find((bank) => bank.id === query.banco) ?? banks[0] ?? null;
  const lines = selected ? await listBankLines(user.accountId, selected.id) : [];
  const balance = (selected?.openingCents ?? 0) + lines.reduce((sum, line) => sum + line.amountCents, 0);

  return (
    <Panel user={user} current="/financeiro/bancos" title="Bancos">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <div className="desk">
      <div className="desk-bar">
        <Modal label="Novo banco" title="Novo banco" tone="teal">
          <form action={saveBank}>
            <div className="split">
              <label>
                Nome
                <input name="name" required />
              </label>
              <label>
                Instituição
                <input name="institution" placeholder="Itaú, Bradesco, Caixa" />
              </label>
              <label>
                Tipo
                <select name="kind" defaultValue="corrente">
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
              <label>
                Código
                <input name="code" />
              </label>
              <label>
                Saldo de abertura
                <input name="opening" placeholder="0,00" />
              </label>
              <label>
                Data do saldo
                <input type="date" name="opening_on" defaultValue={todaySaoPaulo()} />
              </label>
            </div>
            <SubmitButton label="Salvar banco" pendingLabel="Salvando…" />
          </form>
        </Modal>
        {banks.map((bank) => (
          <Link key={bank.id} className={bank.id === selected?.id ? "btn" : "btn quiet"} href={`/financeiro/bancos?banco=${bank.id}`}>
            {bank.name}
          </Link>
        ))}
        {selected ? (
          <>
            {selected.institution ? <span className="chip">{selected.institution}</span> : null}
            <span className="chip">{KINDS[selected.kind] ?? selected.kind}</span>
            {selected.code ? <span className="chip">{selected.code}</span> : null}
            <span className="chip">
              Abertura {formatReais(selected.openingCents)}
              {selected.openingOn ? ` · ${selected.openingOn}` : ""}
            </span>
            <span className="chip ok">Saldo {formatReais(balance)}</span>
            <form action={deleteBank}>
              <input type="hidden" name="id" value={selected.id} />
              <SubmitButton label="Excluir" pendingLabel="Excluindo…" className="quiet" />
            </form>
          </>
        ) : null}
      </div>
      {selected ? (
        <div className="queue" style={{ overflowX: "auto" }}>
          {lines.length === 0 ? <p className="queue-empty">Nenhum lançamento neste banco.</p> : null}
          {lines.length > 0 ? (
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
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.paid}</td>
                    <td>{line.description}</td>
                    <td>{line.partyName}</td>
                    <td>{formatReais(line.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : (
        <p className="queue-empty">Nenhum banco ainda.</p>
      )}
      </div>
    </Panel>
  );
}
