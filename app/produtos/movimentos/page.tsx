import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { STOCK_REASONS } from "@/catalog/labels";
import { todaySaoPaulo } from "@/catalog/format";
import { listAccountMovements } from "@/catalog/queries";
import { dayParam, daysBetween, monthBounds } from "@/desk/clock";
import { Panel } from "@/ui/panel";
import { ReportPeriod } from "@/ui/report-period";

export const dynamic = "force-dynamic";

const SPAN = 92;
const REASONS = ["compra", "venda", "uso", "consumo", "ajuste", "conferencia"] as const;

export default async function ProductMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; motivo?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const today = todaySaoPaulo();
  const month = monthBounds(today);
  let start = dayParam(query.de ?? month.start);
  let end = dayParam(query.ate ?? (query.de ? query.de : today));
  if (start > end) [start, end] = [end, start];
  const tooLong = daysBetween(start, end) > SPAN;
  const reason = REASONS.includes(query.motivo as (typeof REASONS)[number]) ? String(query.motivo) : "";
  const rows = tooLong ? [] : await listAccountMovements(user.accountId, start, end, reason || undefined);
  const inQty = rows.filter((row) => row.qty > 0).reduce((sum, row) => sum + row.qty, 0);
  const outQty = rows.filter((row) => row.qty < 0).reduce((sum, row) => sum + Math.abs(row.qty), 0);
  const extra = reason ? { motivo: reason } : undefined;
  const base = (motivo: string) => {
    const params = new URLSearchParams({ de: start, ate: end });
    if (motivo) params.set("motivo", motivo);
    return `/produtos/movimentos?${params}`;
  };

  return (
    <Panel user={user} current="/produtos" title="Movimentos">
      <div className="desk">
        <ReportPeriod path="/produtos/movimentos" start={start} end={end} tooLong={tooLong} span={SPAN} extra={extra}>
          <Link className={!reason ? "btn" : "btn quiet"} href={base("")}>Todos</Link>
          {REASONS.map((item) => (
            <Link key={item} className={reason === item ? "btn" : "btn quiet"} href={base(item)}>
              {STOCK_REASONS[item]}
            </Link>
          ))}
          <Link className="btn btn-outline" href="/produtos">Produtos</Link>
          <Link className="btn btn-outline" href="/produtos/compra">Compra</Link>
          <Link className="btn btn-outline" href={`/relatorios/estoque?de=${start}&ate=${end}`}>Estoque</Link>
        </ReportPeriod>
        {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
        {!tooLong ? (
          <>
            <div className="statement-totals report-totals">
              <div className="statement-total">
                <span className="label">Lançamentos</span>
                <strong>{rows.length}</strong>
              </div>
              <div className="statement-total net">
                <span className="label">Entrada</span>
                <strong>{inQty}</strong>
              </div>
              <div className="statement-total out">
                <span className="label">Saída</span>
                <strong>{outQty}</strong>
              </div>
            </div>
            <div className="queue statement-day" style={{ overflowX: "auto" }}>
              {rows.length === 0 ? <p className="queue-empty">Nenhum movimento neste filtro.</p> : null}
              {rows.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Produto</th>
                      <th>Motivo</th>
                      <th className="num">Qtd</th>
                      <th>Quem</th>
                      <th>Obs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.at}</td>
                        <td><Link href={`/produtos/${row.productId}`}>{row.productName}</Link></td>
                        <td>{STOCK_REASONS[row.reason] ?? row.reason}</td>
                        <td className={`num ${row.qty < 0 ? "out" : "in"}`}>{row.qty > 0 ? `+${row.qty}` : row.qty}</td>
                        <td>{row.who || "—"}</td>
                        <td>{row.note || ""}</td>
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
