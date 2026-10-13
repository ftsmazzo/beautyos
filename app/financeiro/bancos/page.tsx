import { requireAdmin } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { deleteBank, saveBank } from "@/finance/actions";
import { listBanks } from "@/finance/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { FinanceNav } from "@/ui/finance-nav";
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
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireAdmin();
  const query = await searchParams;
  const banks = await listBanks(user.accountId);

  return (
    <Panel user={user} current="/financeiro" title="Bancos">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <p>O saldo daqui é do banco. O caixa do balcão continua na gaveta.</p>
      <FinanceNav current="bancos" />
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
      <div className="card">
        <h2>Contas</h2>
        {banks.length === 0 ? <p>Nenhum banco ainda. Nenhum lançamento entra aqui enquanto a conta não existir.</p> : null}
        {banks.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Instituição</th>
                <th>Tipo</th>
                <th>Código</th>
                <th>Saldo de abertura</th>
                <th>Data</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {banks.map((bank) => (
                <tr key={bank.id}>
                  <td>{bank.name}</td>
                  <td>{bank.institution ?? ""}</td>
                  <td>{KINDS[bank.kind] ?? bank.kind}</td>
                  <td>{bank.code ?? ""}</td>
                  <td>{formatReais(bank.openingCents)}</td>
                  <td>{bank.openingOn ?? ""}</td>
                  <td>
                    <form action={deleteBank}>
                      <input type="hidden" name="id" value={bank.id} />
                      <SubmitButton label="Excluir" pendingLabel="Excluindo…" className="quiet" />
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
