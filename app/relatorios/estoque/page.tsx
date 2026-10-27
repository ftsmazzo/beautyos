import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds } from "@/desk/clock";
import { stockReport } from "@/desk/reports";
import { Panel } from "@/ui/panel";
import { ReportPeriod } from "@/ui/report-period";

export const dynamic = "force-dynamic";

const SPAN = 92;

function need(balance: number, minQty: number) {
  if (minQty <= 0 || balance >= minQty) return 0;
  return minQty - balance;
}

export default async function StockReportPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; uso?: string; filtro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const today = todaySaoPaulo();
  const month = monthBounds(today);
  let start = dayParam(query.de ?? month.start);
  let end = dayParam(query.ate ?? (query.de ? query.de : today));
  if (start > end) [start, end] = [end, start];
  const tooLong = daysBetween(start, end) > SPAN;
  const uso = query.uso === "vende" || query.uso === "insumo" ? query.uso : "";
  const onlyLow = query.filtro === "minimo";
  const rows = tooLong ? [] : await stockReport(user.accountId, start, end);
  const scoped = rows.filter((row) => {
    if (uso === "vende" && !row.sells) return false;
    if (uso === "insumo" && !row.supply) return false;
    if (onlyLow && need(row.balance, row.minQty) <= 0) return false;
    return true;
  });
  const low = rows.filter((row) => need(row.balance, row.minQty) > 0);
  const zero = rows.filter((row) => row.balance <= 0);
  const parked = rows.reduce((sum, row) => sum + Math.max(0, row.balance) * row.saleCents, 0);
  const parkedCost = rows.reduce((sum, row) => sum + Math.max(0, row.balance) * row.costCents, 0);
  const orderUnits = low.reduce((sum, row) => sum + need(row.balance, row.minQty), 0);
  const orderCost = low.reduce((sum, row) => sum + need(row.balance, row.minQty) * row.costCents, 0);
  const extra = { ...(uso ? { uso } : {}), ...(onlyLow ? { filtro: "minimo" } : {}) };
  const base = (next: { uso?: string; filtro?: string }) => {
    const params = new URLSearchParams({ de: start, ate: end });
    if (next.uso) params.set("uso", next.uso);
    if (next.filtro) params.set("filtro", next.filtro);
    return `/relatorios/estoque?${params}`;
  };

  return (
    <Panel user={user} current="/relatorios" title={onlyLow ? "Lista de compra" : "Estoque"}>
      <div className="desk">
        <ReportPeriod path="/relatorios/estoque" start={start} end={end} tooLong={tooLong} span={SPAN} extra={extra}>
          <Link className={!uso && !onlyLow ? "btn" : "btn quiet"} href={base({})}>Todos</Link>
          <Link className={uso === "vende" ? "btn" : "btn quiet"} href={base({ uso: "vende", filtro: onlyLow ? "minimo" : "" })}>Venda</Link>
          <Link className={uso === "insumo" ? "btn" : "btn quiet"} href={base({ uso: "insumo", filtro: onlyLow ? "minimo" : "" })}>Insumo</Link>
          <Link className={onlyLow ? "btn" : "btn quiet"} href={base({ uso, filtro: onlyLow ? "" : "minimo" })}>
            {onlyLow ? "Todos os saldos" : "No mínimo"}
          </Link>
          <Link className="btn quiet" href={`/relatorios/compras?de=${start}&ate=${end}`}>Compras</Link>
          <Link className="btn quiet" href={`/produtos/movimentos?de=${start}&ate=${end}`}>Movimentos</Link>
          <Link className="btn quiet" href={`/relatorios?de=${start}&ate=${end}`}>Painel</Link>
        </ReportPeriod>
        {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
        {!tooLong ? (
          <>
            <div className="statement-totals report-totals">
              <div className="statement-total">
                <span className="label">Itens</span>
                <strong>{rows.length}</strong>
              </div>
              <div className="statement-total out">
                <span className="label">No mínimo</span>
                <strong>{low.length}</strong>
                <span className="report-delta">{zero.length} zerado{zero.length === 1 ? "" : "s"}</span>
              </div>
              <div className="statement-total net">
                <span className="label">Parado venda</span>
                <strong>{formatReais(parked)}</strong>
                <span className="report-delta">saldo × preço</span>
              </div>
              <div className="statement-total out">
                <span className="label">Parado custo</span>
                <strong>{formatReais(parkedCost)}</strong>
                <span className="report-delta">saldo × custo</span>
              </div>
              <div className="statement-total">
                <span className="label">A pedir</span>
                <strong>{orderUnits}</strong>
                <span className="report-delta">{orderCost > 0 ? formatReais(orderCost) : "sem custo"}</span>
              </div>
            </div>
            <div className="queue statement-day" style={{ overflowX: "auto" }}>
              {scoped.length === 0 ? <p className="queue-empty">Nenhum produto neste filtro.</p> : null}
              {scoped.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th className="num">Saldo</th>
                      <th className="num">Mínimo</th>
                      <th className="num">Custo</th>
                      <th className="num">Margem</th>
                      <th className="num">Vendeu</th>
                      <th className="num">Valor</th>
                      <th className="num">Pedir</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoped.map((row) => {
                      const ask = need(row.balance, row.minQty);
                      const margin = row.saleCents - row.costCents;
                      return (
                        <tr key={row.id}>
                          <td><Link href={`/produtos/${row.id}`}>{row.name}</Link></td>
                          <td className="num">{row.balance}</td>
                          <td className="num">{row.minQty > 0 ? row.minQty : ""}</td>
                          <td className="num">{row.costCents > 0 ? formatReais(row.costCents) : ""}</td>
                          <td className="num">{row.sells ? formatReais(margin) : ""}</td>
                          <td className="num">{row.soldQty > 0 ? row.soldQty : ""}</td>
                          <td className="num">{row.soldCents > 0 ? formatReais(row.soldCents) : ""}</td>
                          <td className="num">{ask > 0 ? ask : ""}</td>
                          <td>{ask > 0 && row.costCents > 0 ? formatReais(ask * row.costCents) : ""}</td>
                        </tr>
                      );
                    })}
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
