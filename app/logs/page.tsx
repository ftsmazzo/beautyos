import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, todaySaoPaulo } from "@/catalog/format";
import { dayParam, shiftDay } from "@/desk/clock";
import { dayLogs } from "@/desk/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const KIND_WORD: Record<string, string> = {
  valor: "Valor",
  cancelamento: "Cancelamento",
};

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const day = dayParam(query.dia);
  const logs = await dayLogs(user.accountId, day);

  return (
    <Panel user={user} current="/logs" title="Logs">
      <div className="row">
        <Link className="btn quiet" href={`/logs?dia=${shiftDay(day, -1)}`}>
          Dia anterior
        </Link>
        <strong>{formatDay(day)}</strong>
        <Link className="btn quiet" href={`/logs?dia=${shiftDay(day, 1)}`}>
          Próximo dia
        </Link>
        <Link className="btn quiet" href={`/logs?dia=${todaySaoPaulo()}`}>
          Hoje
        </Link>
      </div>
      <div className="card">
        <h2>Registro do dia</h2>
        <p>Preço alterado, cortesia e cancelamento. Cada linha guarda quem fez e o que mudou.</p>
        {logs.length === 0 ? <p>Nenhum registro neste dia.</p> : null}
        {logs.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Quem</th>
                <th>Tipo</th>
                <th>Comanda</th>
                <th>Registro</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{log.at}</td>
                  <td>{log.actorName ?? "—"}</td>
                  <td>{KIND_WORD[log.kind] ?? log.kind}</td>
                  <td>
                    {log.orderId ? (
                      <Link href={`/comandas/${log.orderId}`}>
                        {log.clientName ?? "Sem nome"}
                        {log.orderDay ? ` · ${log.orderDay}` : ""}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
