import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds } from "@/desk/clock";
import { deltaPercent, financeReport, previousSpan } from "@/desk/reports";
import { paymentMethodLabel } from "@/desk/statuses";
import { Panel } from "@/ui/panel";
import { ReportPeriod } from "@/ui/report-period";

export const dynamic = "force-dynamic";

const SPAN = 92;

function share(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 1000) / 10}%`;
}

export default async function FinanceReportPage({
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
  const report = tooLong ? null : await financeReport(user.accountId, start, end);
  const previous = previousSpan(start, end);
  const net = (report?.cents ?? 0) - (report?.fees ?? 0);
  const previousNet = (report?.previousCents ?? 0) - (report?.previousFees ?? 0);
  const delta = report ? deltaPercent(net, previousNet) : null;
  const peak = report?.days.reduce((max, row) => Math.max(max, row.cents - row.fees), 0) ?? 0;

  return (
    <Panel user={user} current="/relatorios" title="Financeiro">
      <div className="desk">
        <ReportPeriod path="/relatorios/financeiro" start={start} end={end} tooLong={tooLong} span={SPAN}>
          <Link className="btn quiet" href={`/caixa?de=${start}&ate=${end}`}>Caixa</Link>
          <Link className="btn quiet" href={`/relatorios?de=${start}&ate=${end}`}>Painel</Link>
        </ReportPeriod>
        {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
        {report && report.cents === 0 ? (
          <div className="queue"><p className="queue-empty">Nenhum recebimento neste período.</p></div>
        ) : null}
        {report && report.cents > 0 ? (
          <>
            <div className="statement-totals">
              <div className="statement-total">
                <span className="label">Recebido</span>
                <strong>{formatReais(report.cents)}</strong>
              </div>
              <div className="statement-total out">
                <span className="label">Taxa</span>
                <strong>{formatReais(report.fees)}</strong>
                <span className="report-delta">{share(report.fees, report.cents)} do recebido</span>
              </div>
              <div className="statement-total net">
                <span className="label">Líquido</span>
                <strong>{formatReais(net)}</strong>
                <span className="report-delta">
                  {delta == null ? "sem período anterior" : `${delta > 0 ? "+" : ""}${delta}% vs ${formatDay(previous.start)}–${formatDay(previous.end)}`}
                </span>
              </div>
            </div>
            <div className="report-split">
              <div className="queue statement-day" style={{ overflowX: "auto" }}>
                <div className="queue-head"><h2>Formas</h2></div>
                <table>
                  <thead>
                    <tr>
                      <th>Forma</th>
                      <th className="num">Qtd</th>
                      <th className="num">Recebido</th>
                      <th className="num">Taxa</th>
                      <th className="num">Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.methods.map((row) => (
                      <tr key={row.name}>
                        <td>{paymentMethodLabel(row.name)}</td>
                        <td className="num">{row.qty}</td>
                        <td className="num">{formatReais(row.cents)}</td>
                        <td className="num">{row.fees > 0 ? formatReais(row.fees) : ""}</td>
                        <td className="num">{formatReais(row.cents - row.fees)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="queue statement-day" style={{ overflowX: "auto" }}>
                <div className="queue-head"><h2>Dia a dia</h2></div>
                <table>
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Líquido</th>
                      <th className="num">Taxa</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.days.map((row) => {
                      const dayNet = row.cents - row.fees;
                      return (
                        <tr key={row.day}>
                          <td>{formatDay(row.day)}</td>
                          <td>
                            <span className="report-track" aria-hidden="true">
                              <span className="report-bar" style={{ transform: `scaleX(${peak > 0 ? dayNet / peak : 0})` }} />
                            </span>
                            {formatReais(dayNet)}
                          </td>
                          <td className="num">{row.fees > 0 ? formatReais(row.fees) : ""}</td>
                          <td><Link href={`/caixa?dia=${row.day}`}>Caixa</Link></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}