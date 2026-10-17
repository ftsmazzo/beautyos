import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds, shiftDay, weekBounds } from "@/desk/clock";
import { periodLogs } from "@/desk/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const SPAN = 92;

const KIND_WORD: Record<string, string> = {
  valor: "Valor",
  cancelamento: "Cancelamento",
  cliente: "Cliente",
};

const KINDS = [
  { id: "", label: "Todos" },
  { id: "valor", label: "Valor" },
  { id: "cliente", label: "Cliente" },
  { id: "cancelamento", label: "Cancelamento" },
] as const;

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; de?: string; ate?: string; tipo?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const today = todaySaoPaulo();
  const period = Boolean(query.de || query.ate);
  let start = dayParam(query.de ?? query.dia);
  let end = dayParam(query.ate ?? query.dia ?? start);
  if (start > end) [start, end] = [end, start];
  const tooLong = daysBetween(start, end) > SPAN;
  const kind = KINDS.some((item) => item.id && item.id === query.tipo) ? query.tipo! : null;
  const logs = tooLong ? [] : await periodLogs(user.accountId, start, end, kind);
  const week = weekBounds(today);
  const month = monthBounds(today);
  const rangeQuery = (from: string, to: string, tipo: string | null) => {
    const base = `/logs?de=${from}&ate=${to}`;
    return tipo ? `${base}&tipo=${tipo}` : base;
  };

  return (
    <Panel user={user} current="/logs" title="Logs">
      {!period ? (
        <div className="row">
          <Link className="btn quiet" href={`/logs?dia=${shiftDay(start, -1)}`}>
            Dia anterior
          </Link>
          <strong>{formatDay(start)}</strong>
          <Link className="btn quiet" href={`/logs?dia=${shiftDay(start, 1)}`}>
            Próximo dia
          </Link>
          <Link className="btn quiet" href={`/logs?dia=${today}`}>
            Hoje
          </Link>
          <Link className="btn quiet" href={rangeQuery(week.start, today, kind)}>
            Esta semana
          </Link>
          <Link className="btn quiet" href={rangeQuery(month.start, today, kind)}>
            Este mês
          </Link>
        </div>
      ) : (
        <>
          <form className="row" action="/logs">
            <label>
              De
              <input name="de" type="date" defaultValue={start} required />
            </label>
            <label>
              Até
              <input name="ate" type="date" defaultValue={end} required />
            </label>
            {kind ? <input type="hidden" name="tipo" value={kind} /> : null}
            <button className="btn" type="submit">
              Ver período
            </button>
          </form>
          <div className="row">
            <Link className="btn quiet" href={`/logs?dia=${today}`}>
              Voltar ao dia
            </Link>
            <Link className="btn quiet" href={rangeQuery(week.start, today, kind)}>
              Esta semana
            </Link>
            <Link className="btn quiet" href={rangeQuery(month.start, today, kind)}>
              Este mês
            </Link>
            <strong>
              {formatDay(start)} – {formatDay(end)}
            </strong>
          </div>
        </>
      )}
      <div className="row">
        {KINDS.map((item) => {
          const href = period
            ? rangeQuery(start, end, item.id || null)
            : item.id
              ? `/logs?dia=${start}&tipo=${item.id}`
              : `/logs?dia=${start}`;
          const active = (item.id || null) === kind;
          return (
            <Link key={item.id || "todos"} className={active ? "btn" : "btn quiet"} href={href}>
              {item.label}
            </Link>
          );
        })}
      </div>
      <div className="card">
        <h2>{period ? "Registro do período" : "Registro do dia"}</h2>
        <p>Preço alterado, troca de cliente, cortesia e cancelamento. Cada linha guarda quem fez e o que mudou.</p>
        {tooLong ? <p className="error">O período fica em até {SPAN} dias.</p> : null}
        {!tooLong && logs.length === 0 ? <p>Nenhum registro neste recorte.</p> : null}
        {logs.length > 0 ? (
          <table className="sheet">
            <thead>
              <tr>
                {period ? <th>Dia</th> : null}
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
                  {period ? <td data-label="Dia">{formatDay(log.day)}</td> : null}
                  <td data-label="Hora">{log.at}</td>
                  <td data-label="Quem">{log.actorName ?? "—"}</td>
                  <td data-label="Tipo">{KIND_WORD[log.kind] ?? log.kind}</td>
                  <td data-label="Comanda">
                    {log.orderId ? (
                      <Link href={`/comandas/${log.orderId}`}>
                        {log.clientName ?? "Sem nome"}
                        {log.orderDay ? ` · ${log.orderDay}` : ""}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td data-label="Registro">{log.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
