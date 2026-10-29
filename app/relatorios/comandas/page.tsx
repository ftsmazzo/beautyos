import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds } from "@/desk/clock";
import { ordersReport } from "@/desk/reports";
import { Panel } from "@/ui/panel";
import { ReportPeriod } from "@/ui/report-period";

export const dynamic = "force-dynamic";

const SPAN = 92;

export default async function OrdersReportPage({
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
  const report = tooLong ? null : await ordersReport(user.accountId, start, end);
  const qty = report?.states.reduce((sum, row) => sum + row.qty, 0) ?? 0;
  const items = report?.states.reduce((sum, row) => sum + row.items, 0) ?? 0;
  const open = report?.states.find((row) => row.status === "aberta")?.qty ?? 0;
  const closedRow = report?.states.find((row) => row.status === "fechada");
  const closed = closedRow?.qty ?? 0;
  const ticket = closed > 0 ? Math.round((closedRow?.cents ?? 0) / closed) : 0;
  const avgItems = qty > 0 ? Math.round((items / qty) * 10) / 10 : 0;

  return (
    <Panel user={user} current="/relatorios" title="Comandas">
      <div className="desk">
        <ReportPeriod path="/relatorios/comandas" start={start} end={end} tooLong={tooLong} span={SPAN}>
          <Link className="btn btn-outline" href={`/relatorios?de=${start}&ate=${end}`}>Painel</Link>
        </ReportPeriod>
        {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
        {report && qty === 0 ? (
          <div className="queue"><p className="queue-empty">Nenhuma comanda neste período.</p></div>
        ) : null}
        {report && qty > 0 ? (
          <>
            <div className="statement-totals report-totals">
              <div className="statement-total net">
                <span className="label">Comandas</span>
                <strong>{qty}</strong>
                <span className="report-delta">{open} aberta{open === 1 ? "" : "s"} · {closed} fechada{closed === 1 ? "" : "s"}</span>
              </div>
              <div className="statement-total">
                <span className="label">Ticket</span>
                <strong>{formatReais(ticket)}</strong>
                <span className="report-delta">{closed > 0 ? "das fechadas" : "nenhuma fechada"}</span>
              </div>
              <div className="statement-total">
                <span className="label">Itens</span>
                <strong>{avgItems}</strong>
                <span className="report-delta">{items} no período</span>
              </div>
              <div className="statement-total out">
                <span className="label">Em aberto</span>
                <strong>{report.gaps.length}</strong>
                <span className="report-delta">com falta de pagamento</span>
              </div>
            </div>
            {report.gaps.length > 0 ? (
              <div className="desk-floor">
                <span className="label">Falta receber</span>
                {report.gaps.slice(0, 12).map((row) => (
                  <Link key={row.id} className="badge bg-red-lt text-red" href={`/comandas/${row.id}`}>
                    {row.who} · {formatDay(row.day)} · {formatReais(row.gapCents)}
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="queue statement-day" style={{ overflowX: "auto" }}>
              <div className="queue-head"><h2>Por profissional</h2></div>
              <table>
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th className="num">Comandas</th>
                    <th className="num">Abertas</th>
                    <th className="num">Itens</th>
                    <th className="num">Valor</th>
                    <th className="num">Ticket</th>
                  </tr>
                </thead>
                <tbody>
                  {report.people.length === 0 ? (
                    <tr><td colSpan={6}>Nenhuma linha com profissional.</td></tr>
                  ) : null}
                  {report.people.map((row) => (
                    <tr key={row.id}>
                      <td><Link href={`/comissao?de=${start}&ate=${end}&profissional=${row.id}`}>{row.name}</Link></td>
                      <td className="num">{row.orders}</td>
                      <td className="num">{row.open}</td>
                      <td className="num">{row.items}</td>
                      <td className="num">{formatReais(row.cents)}</td>
                      <td className="num">{formatReais(row.orders > 0 ? Math.round(row.cents / row.orders) : 0)}</td>
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
