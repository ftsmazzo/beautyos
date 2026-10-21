import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, todaySaoPaulo } from "@/catalog/format";
import { birthdaysAhead } from "@/catalog/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function AniversariantesPage() {
  const user = await requireOperator();
  const today = todaySaoPaulo();
  const rows = await birthdaysAhead(user.accountId, today, 30);

  return (
    <Panel user={user} current="/aniversariantes" title="Aniversariantes">
      <div className="desk">
      <div className="desk-bar">
        <span className="chip">30 dias · {rows.length}</span>
        <Link className="btn quiet" href="/lembretes">
          Lembretes
        </Link>
        <Link className="btn quiet" href="/clientes">
          Clientes
        </Link>
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p className="queue-empty">Ninguém neste período.</p> : null}
        {rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Quem</th>
                <th>Tipo</th>
                <th>Celular</th>
                <th>Idade</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.kind}-${row.id}-${row.day}`}>
                  <td>{formatDay(row.day)}</td>
                  <td>
                    {row.kind === "cliente" ? (
                      <Link href={`/clientes/${row.id}`}>{row.name}</Link>
                    ) : (
                      <Link href={`/profissionais/${row.id}`}>{row.name}</Link>
                    )}
                  </td>
                  <td>{row.kind === "cliente" ? "Cliente" : "Equipe"}</td>
                  <td>{row.phone ? formatPhone(row.phone) : "—"}</td>
                  <td>{row.turning}</td>
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
