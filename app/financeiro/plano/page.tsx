import { requireAdmin } from "@/catalog/access";
import { deleteChart, saveChart } from "@/finance/actions";
import { listChart } from "@/finance/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { FinanceNav } from "@/ui/finance-nav";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

function pair(first: string | null, second: string | null) {
  return [first, second].filter(Boolean).join(" / ");
}

export default async function ChartPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireAdmin();
  const query = await searchParams;
  const rows = await listChart(user.accountId);

  return (
    <Panel user={user} current="/financeiro" title="Plano de contas">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <p>Código, nome analítico, grupo sintético e os grupos do fluxo e do resultado.</p>
      <FinanceNav current="plano" />
      <form action={saveChart}>
        <div className="split">
          <label>
            Código
            <input name="code" required />
          </label>
          <label>
            Nome analítico
            <input name="name" required />
          </label>
          <label>
            Sintética
            <input name="synthetic" />
          </label>
          <label>
            Fluxo 1
            <input name="dfc1" />
          </label>
          <label>
            Fluxo 2
            <input name="dfc2" />
          </label>
          <label>
            Resultado 1
            <input name="dre1" />
          </label>
          <label>
            Resultado 2
            <input name="dre2" />
          </label>
        </div>
        <SubmitButton label="Salvar conta" pendingLabel="Salvando…" />
      </form>
      <div className="card">
        <h2>Contas</h2>
        {rows.length === 0 ? <p>Nenhuma conta no plano ainda.</p> : null}
        {rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Analítica</th>
                <th>Sintética</th>
                <th>Fluxo</th>
                <th>Resultado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.code}</td>
                  <td>{row.name}</td>
                  <td>{row.syntheticName ?? ""}</td>
                  <td>{pair(row.dfcGroup1, row.dfcGroup2)}</td>
                  <td>{pair(row.dreGroup1, row.dreGroup2)}</td>
                  <td>
                    <form action={deleteChart}>
                      <input type="hidden" name="id" value={row.id} />
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
