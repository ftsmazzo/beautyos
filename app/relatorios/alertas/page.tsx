import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, todaySaoPaulo } from "@/catalog/format";
import { actionQueue } from "@/desk/reports";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const user = await requireOperator();
  const today = todaySaoPaulo();
  const rows = await actionQueue(user.accountId, today);

  return (
    <Panel user={user} current="/relatorios" title="Alertas">
      <div className="desk">
        <div className="desk-bar">
          <Link className="btn quiet" href="/relatorios">Painel</Link>
          <span className="chip">{formatDay(today)}</span>
          <span className="chip">{rows.length}</span>
        </div>
        <div className="queue statement-day" style={{ overflowX: "auto" }}>
          {rows.length === 0 ? <p className="queue-empty">Nada para agir agora.</p> : null}
          {rows.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>O quê</th>
                  <th className="num">Qtd</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.label}</td>
                    <td className="num">{row.count}</td>
                    <td><Link href={row.href}>Abrir</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}