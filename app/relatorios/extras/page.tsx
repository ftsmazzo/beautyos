import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds } from "@/desk/clock";
import { extrasReport } from "@/desk/reports";
import { Panel } from "@/ui/panel";
import { ReportPeriod } from "@/ui/report-period";

export const dynamic = "force-dynamic";

const SPAN = 92;

function perClient(cents: number, clients: number) {
  if (clients <= 0) return "";
  return formatReais(Math.round(cents / clients));
}

export default async function ExtrasReportPage({
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
  const report = tooLong ? null : await extrasReport(user.accountId, start, end);
  const cents = report?.people.reduce((sum, row) => sum + row.cents, 0) ?? 0;
  const qty = report?.people.reduce((sum, row) => sum + row.qty, 0) ?? 0;
  const quiet = report?.people.filter((row) => row.clients > 0 && row.qty === 0).length ?? 0;
  const selling = report?.people.filter((row) => row.qty > 0).length ?? 0;
  const peak = report?.people.reduce((max, row) => Math.max(max, row.cents), 0) ?? 0;

  return (
    <Panel user={user} current="/relatorios" title="Extras">
      <div className="desk">
        <ReportPeriod path="/relatorios/extras" start={start} end={end} tooLong={tooLong} span={SPAN}>
          <Link className="btn quiet" href="/servicos">Serviços</Link>
          <Link className="btn quiet" href={`/relatorios?de=${start}&ate=${end}`}>Painel</Link>
        </ReportPeriod>
        {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
        {report && report.marked === 0 ? (
          <div className="queue"><p className="queue-empty">Nenhum serviço marcado como extra.</p></div>
        ) : null}
        {report && report.marked > 0 && report.people.length === 0 ? (
          <div className="queue"><p className="queue-empty">Ninguém atendeu neste período.</p></div>
        ) : null}
        {report && report.marked > 0 && report.people.length > 0 ? (
          <>
            <div className="statement-totals report-totals">
              <div className="statement-total net">
                <span className="label">Extras</span>
                <strong>{formatReais(cents)}</strong>
                <span className="report-delta">{qty} no período</span>
              </div>
              <div className="statement-total">
                <span className="label">Quem vendeu</span>
                <strong>{selling}</strong>
                <span className="report-delta">{report.marked} serviço{report.marked === 1 ? "" : "s"} marcado{report.marked === 1 ? "" : "s"}</span>
              </div>
              <div className="statement-total out">
                <span className="label">Sem extra</span>
                <strong>{quiet}</strong>
                <span className="report-delta">atendeu e não vendeu</span>
              </div>
              <div className="statement-total">
                <span className="label">Por cliente</span>
                <strong>{perClient(cents, report.people.reduce((sum, row) => sum + row.clients, 0)) || "—"}</strong>
                <span className="report-delta">média de quem atendeu</span>
              </div>
            </div>
            <div className="queue statement-day" style={{ overflowX: "auto" }}>
              <div className="queue-head"><h2>Por profissional</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th className="num">Atend.</th>
                    <th className="num">Qtd</th>
                    <th>Valor</th>
                    <th className="num">Por cliente</th>
                  </tr>
                </thead>
                <tbody>
                  {report.people.map((row) => (
                    <tr key={row.id}>
                      <td><Link href={`/comissao?de=${start}&ate=${end}&profissional=${row.id}`}>{row.name}</Link></td>
                      <td className="num">{row.clients}</td>
                      <td className="num">{row.qty}</td>
                      <td>
                        <span className="report-track" aria-hidden="true">
                          <span className="report-bar" style={{ transform: `scaleX(${peak > 0 ? row.cents / peak : 0})` }} />
                        </span>
                        {formatReais(row.cents)}
                      </td>
                      <td className="num">{perClient(row.cents, row.clients)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.services.length > 0 ? (
              <div className="queue statement-day" style={{ overflowX: "auto" }}>
                <div className="queue-head"><h2>O que contou</h2></div>
                <table>
                  <thead>
                    <tr>
                      <th>Serviço</th>
                      <th className="num">Qtd</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.services.map((row) => (
                      <tr key={row.id}>
                        <td><Link href={`/servicos/${row.id}`}>{row.name}</Link></td>
                        <td className="num">{row.qty}</td>
                        <td className="num">{formatReais(row.cents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}