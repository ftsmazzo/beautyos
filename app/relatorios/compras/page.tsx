import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds } from "@/desk/clock";
import { purchasesReport } from "@/desk/reports";
import { Panel } from "@/ui/panel";
import { ReportPeriod } from "@/ui/report-period";

export const dynamic = "force-dynamic";

const SPAN = 92;

export default async function PurchasesReportPage({
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
  const report = tooLong ? null : await purchasesReport(user.accountId, start, end);
  const total = report?.rows.reduce((sum, row) => sum + row.totalCents, 0) ?? 0;
  const lines = report?.rows.reduce((sum, row) => sum + row.lines, 0) ?? 0;
  const peak = report?.suppliers.reduce((max, row) => Math.max(max, row.cents), 0) ?? 0;

  return (
    <Panel user={user} current="/relatorios" title="Compras">
      <div className="desk">
        <ReportPeriod path="/relatorios/compras" start={start} end={end} tooLong={tooLong} span={SPAN}>
          <Link className="btn quiet" href="/produtos/compra">Lançar</Link>
          <Link className="btn quiet" href={`/produtos/movimentos?de=${start}&ate=${end}&motivo=compra`}>Movimentos</Link>
          <Link className="btn quiet" href={`/relatorios/estoque?de=${start}&ate=${end}`}>Estoque</Link>
          <Link className="btn quiet" href={`/relatorios?de=${start}&ate=${end}`}>Painel</Link>
        </ReportPeriod>
        {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
        {report && report.rows.length === 0 ? (
          <div className="queue"><p className="queue-empty">Nenhuma compra neste período.</p></div>
        ) : null}
        {report && report.rows.length > 0 ? (
          <>
            <div className="statement-totals report-totals">
              <div className="statement-total">
                <span className="label">Notas</span>
                <strong>{report.rows.length}</strong>
              </div>
              <div className="statement-total out">
                <span className="label">Custo</span>
                <strong>{formatReais(total)}</strong>
                <span className="report-delta">{lines} linha{lines === 1 ? "" : "s"}</span>
              </div>
              <div className="statement-total">
                <span className="label">Fornecedores</span>
                <strong>{report.suppliers.length}</strong>
              </div>
            </div>
            <div className="report-split">
              <div className="queue statement-day" style={{ overflowX: "auto" }}>
                <div className="queue-head"><h2>Notas</h2></div>
                <table>
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Fornecedor</th>
                      <th>Nota</th>
                      <th className="num">Itens</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.day}</td>
                        <td>{row.supplierName}</td>
                        <td><Link href={`/produtos/compra/${row.id}`}>{row.document}</Link></td>
                        <td className="num">{row.lines}</td>
                        <td className="num out">{formatReais(row.totalCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="queue">
                <div className="queue-head"><h2>Por fornecedor</h2></div>
                {report.suppliers.map((row) => (
                  <div className="report-track" key={row.name}>
                    <div className="desk-bar" style={{ justifyContent: "space-between" }}>
                      <strong>{row.name}</strong>
                      <span className="chip">{row.qty} · {formatReais(row.cents)}</span>
                    </div>
                    <div
                      className="report-bar"
                      style={{ transform: `scaleX(${peak > 0 ? row.cents / peak : 0})` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </Panel>
  );
}
