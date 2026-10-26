import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds } from "@/desk/clock";
import { CALL_AFTER, clientSilence, clientsReturned, LOST_AFTER, RETURN_GAP } from "@/desk/reports";
import { Panel } from "@/ui/panel";
import { ReportPeriod } from "@/ui/report-period";

export const dynamic = "force-dynamic";

const SPAN = 92;
const SHOWN = 80;

function isList(value: string | undefined): value is "chamar" | "sumidos" | "voltaram" {
  return value === "chamar" || value === "sumidos" || value === "voltaram";
}

export default async function ClientReportPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; lista?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const today = todaySaoPaulo();
  const month = monthBounds(today);
  let start = dayParam(query.de ?? month.start);
  let end = dayParam(query.ate ?? (query.de ? query.de : today));
  if (start > end) [start, end] = [end, start];
  const tooLong = daysBetween(start, end) > SPAN;
  const lista = isList(query.lista) ? query.lista : "chamar";
  const [silent, returned] = tooLong
    ? [[], []]
    : await Promise.all([clientSilence(user.accountId, today), clientsReturned(user.accountId, start, end)]);
  const call = silent.filter((row) => row.days < LOST_AFTER);
  const lost = silent.filter((row) => row.days >= LOST_AFTER);
  const rows = lista === "voltaram" ? returned : lista === "sumidos" ? lost : call;
  const visible = rows.slice(0, SHOWN);
  const extra = lista === "chamar" ? undefined : { lista };
  const base = (next: string) => {
    const params = new URLSearchParams({ de: start, ate: end });
    if (next !== "chamar") params.set("lista", next);
    return `/relatorios/clientes?${params}`;
  };
  const title = lista === "voltaram" ? "Voltaram" : lista === "sumidos" ? "Sumidos" : "Quem chamar";

  return (
    <Panel user={user} current="/relatorios" title={title}>
      <div className="desk">
        <ReportPeriod path="/relatorios/clientes" start={start} end={end} tooLong={tooLong} span={SPAN} extra={extra}>
          <Link className={lista === "chamar" ? "btn" : "btn quiet"} href={base("chamar")}>Chamar</Link>
          <Link className={lista === "sumidos" ? "btn" : "btn quiet"} href={base("sumidos")}>Sumidos</Link>
          <Link className={lista === "voltaram" ? "btn" : "btn quiet"} href={base("voltaram")}>Voltaram</Link>
          <Link className="btn quiet" href="/volta">Volta</Link>
          <Link className="btn quiet" href={`/relatorios?de=${start}&ate=${end}`}>Painel</Link>
        </ReportPeriod>
        {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
        {!tooLong ? (
          <>
            <div className="statement-totals">
              <div className="statement-total net">
                <span className="label">Chamar</span>
                <strong>{call.length}</strong>
                <span className="report-delta">{CALL_AFTER}–{LOST_AFTER - 1} dias, sem horário</span>
              </div>
              <div className="statement-total out">
                <span className="label">Sumidos</span>
                <strong>{lost.length}</strong>
                <span className="report-delta">{LOST_AFTER} dias ou mais</span>
              </div>
              <div className="statement-total">
                <span className="label">Voltaram</span>
                <strong>{returned.length}</strong>
                <span className="report-delta">gap de {RETURN_GAP} dias no período</span>
              </div>
            </div>
            <div className="queue statement-day" style={{ overflowX: "auto" }}>
              <div className="queue-head">
                <h2>{title}</h2>
                {rows.length > SHOWN ? <span className="meta">{SHOWN} de {rows.length}</span> : null}
              </div>
              {visible.length === 0 ? <p className="queue-empty">Ninguém nesta lista.</p> : null}
              {lista !== "voltaram" && visible.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Celular</th>
                      <th className="num">Dias</th>
                      <th>Última</th>
                      <th>Serviço</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(lista === "sumidos" ? lost : call).slice(0, SHOWN).map((row) => (
                      <tr key={row.id}>
                        <td><Link href={`/clientes/${row.id}`}>{row.name}</Link></td>
                        <td>{formatPhone(row.phone)}</td>
                        <td className="num">{row.days}</td>
                        <td>{formatDay(row.lastDay)}</td>
                        <td>{row.service ?? ""}</td>
                        <td><Link href={`/agenda?cliente=${row.id}`}>Agendar</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {lista === "voltaram" && visible.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Celular</th>
                      <th>Volta</th>
                      <th className="num">Gap</th>
                      <th>Serviço</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returned.slice(0, SHOWN).map((row) => (
                      <tr key={row.id}>
                        <td><Link href={`/clientes/${row.id}`}>{row.name}</Link></td>
                        <td>{formatPhone(row.phone)}</td>
                        <td>{formatDay(row.day)}</td>
                        <td className="num">{row.gap}</td>
                        <td>{row.service ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
