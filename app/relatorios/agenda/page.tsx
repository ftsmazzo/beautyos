import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds } from "@/desk/clock";
import { agendaReport } from "@/desk/reports";
import { Panel } from "@/ui/panel";
import { ReportPeriod } from "@/ui/report-period";

export const dynamic = "force-dynamic";

const SPAN = 92;
const HOURS = Array.from({ length: 13 }, (_, index) => index + 8);

function rate(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 1000) / 10}%`;
}

export default async function AgendaReportPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const today = todaySaoPaulo();
  const month = monthBounds(today);
  let start = dayParam(query.de ?? month.start);
  let end = dayParam(query.ate ?? (query.de ? query.de : today));
  if (start > end) [start, end] = [end, start];
  const tooLong = daysBetween(start, end) > SPAN;
  const report = tooLong ? null : await agendaReport(user.accountId, start, end);
  const qty = report?.people.reduce((sum, row) => sum + row.qty, 0) ?? 0;
  const done = report?.people.reduce((sum, row) => sum + row.done, 0) ?? 0;
  const absent = report?.people.reduce((sum, row) => sum + row.absent, 0) ?? 0;
  const cancelled = report?.people.reduce((sum, row) => sum + row.cancelled, 0) ?? 0;
  const peak = report?.hours.reduce((max, row) => Math.max(max, row.hour >= 8 && row.hour <= 20 ? row.qty : 0), 0) ?? 0;
  const outside = report?.hours.reduce((sum, row) => sum + (row.hour < 8 || row.hour > 20 ? row.qty : 0), 0) ?? 0;
  const hourQty = new Map(report?.hours.map((row) => [row.hour, row.qty]) ?? []);

  return (
    <Panel user={user} current="/relatorios" title="Agenda">
      <div className="desk">
        <ReportPeriod path="/relatorios/agenda" start={start} end={end} tooLong={tooLong} span={SPAN}>
          <Link className="btn btn-outline" href={`/relatorios?de=${start}&ate=${end}`}>Painel</Link>
        </ReportPeriod>
        {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
        {report && qty === 0 ? (
          <div className="queue"><p className="queue-empty">Nenhum horário neste período.</p></div>
        ) : null}
        {report && qty > 0 ? (
          <>
            <div className="statement-totals report-totals">
              <div className="statement-total net">
                <span className="label">Horários</span>
                <strong>{qty}</strong>
              </div>
              <div className="statement-total">
                <span className="label">Realizados</span>
                <strong>{done}</strong>
                <span className="report-delta">{rate(done, qty)}</span>
              </div>
              <div className="statement-total out">
                <span className="label">Faltas</span>
                <strong>{absent}</strong>
                <span className="report-delta">{rate(absent, qty)}</span>
              </div>
              <div className="statement-total">
                <span className="label">Cancelados</span>
                <strong>{cancelled}</strong>
                <span className="report-delta">{rate(cancelled, qty)}</span>
              </div>
            </div>
            <div className="queue">
              <div className="queue-head">
                <h2>Horas cheias</h2>
                {outside > 0 ? <span className="meta">{outside} fora das 8–20</span> : null}
              </div>
              <div className="hour-row">
                {HOURS.map((hour) => {
                  const count = hourQty.get(hour) ?? 0;
                  const heat = peak > 0 ? count / peak : 0;
                  return (
                    <div
                      key={hour}
                      className="hour-cell"
                      style={{ background: `rgba(31, 107, 107, ${0.08 + heat * 0.72})`, color: heat > 0.55 ? "#fff" : undefined }}
                    >
                      <strong>{String(hour).padStart(2, "0")}</strong>
                      <span>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="queue statement-day" style={{ overflowX: "auto" }}>
              <div className="queue-head"><h2>Por profissional</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th className="num">Horários</th>
                    <th className="num">Realizados</th>
                    <th className="num">Faltas</th>
                    <th className="num">Cancelados</th>
                    <th className="num">Falta</th>
                  </tr>
                </thead>
                <tbody>
                  {report.people.map((row) => (
                    <tr key={row.id}>
                      <td><Link href={`/agenda?dia=${end}`}>{row.name}</Link></td>
                      <td className="num">{row.qty}</td>
                      <td className="num">{row.done}</td>
                      <td className="num">{row.absent}</td>
                      <td className="num">{row.cancelled}</td>
                      <td className="num">{rate(row.absent, row.qty)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
