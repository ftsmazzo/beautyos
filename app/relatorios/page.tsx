import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { productsAtMinimum } from "@/catalog/queries";
import { dayParam, daysBetween, monthBounds, shiftDay, weekBounds } from "@/desk/clock";
import { clientSilence, deltaPercent, LOST_AFTER, managementReport, previousSpan, type ReportSlice } from "@/desk/reports";
import { APPOINTMENT_STATUS, paymentMethodLabel } from "@/desk/statuses";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const SPAN = 92;

const STATUS_ORDER = ["realizado", "confirmado", "agendado", "chegou", "em_atendimento", "ausente", "cancelado"] as const;

function spanHref(start: string, end: string) {
  return `/relatorios?de=${start}&ate=${end}`;
}

function share(cents: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((cents / total) * 1000) / 10}%`;
}

function RankTable({
  title,
  rows,
  hrefFor,
}: {
  title: string;
  rows: ReportSlice[];
  hrefFor?: (row: ReportSlice) => string | null;
}) {
  const total = rows.reduce((sum, row) => sum + row.cents, 0);
  return (
    <div className="queue" style={{ overflowX: "auto" }}>
      <div className="queue-head">
        <h2>{title}</h2>
      </div>
      {rows.length === 0 ? <p className="queue-empty">Nada neste período.</p> : null}
      {rows.length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Nome</th>
              <th className="num">Qtd</th>
              <th className="num">Valor</th>
              <th className="num">Parte</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const href = hrefFor?.(row) ?? null;
              return (
                <tr key={`${row.name}-${index}`}>
                  <td>{index + 1}</td>
                  <td>{href ? <Link href={href}>{row.name}</Link> : row.name}</td>
                  <td className="num">{row.qty}</td>
                  <td className="num">{formatReais(row.cents)}</td>
                  <td className="num">{share(row.cents, total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const today = todaySaoPaulo();
  const month = monthBounds(today);
  let start = dayParam(query.de ?? month.start);
  let end = dayParam(query.ate ?? today);
  if (start > end) [start, end] = [end, start];
  const tooLong = daysBetween(start, end) > SPAN;
  const week = weekBounds(today);
  const previous = previousSpan(start, end);
  const [report, lowStock, silent] = await Promise.all([
    tooLong ? Promise.resolve(null) : managementReport(user.accountId, start, end),
    productsAtMinimum(user.accountId),
    clientSilence(user.accountId, today),
  ]);
  const toCall = silent.filter((row) => row.days < LOST_AFTER).length;
  const revenue = report?.revenueCents ?? 0;
  const delta = report ? deltaPercent(revenue, report.previousCents) : null;
  const closed = report?.closedOrders ?? 0;
  const ticket = closed > 0 ? Math.round(revenue / closed) : 0;
  const agenda = report?.statuses.reduce((sum, row) => sum + row.qty, 0) ?? 0;
  const absent = report?.statuses.find((row) => row.status === "ausente")?.qty ?? 0;
  const cancelled = report?.statuses.find((row) => row.status === "cancelado")?.qty ?? 0;
  const absentRate = agenda > 0 ? Math.round((absent / agenda) * 1000) / 10 : 0;
  const cancelRate = agenda > 0 ? Math.round((cancelled / agenda) * 1000) / 10 : 0;
  const peak = report?.days.reduce((max, row) => Math.max(max, row.cents), 0) ?? 0;
  const methodTotal = report?.methods.reduce((sum, row) => sum + row.cents, 0) ?? 0;
  const empty = report != null && revenue === 0 && agenda === 0 && report.services.length === 0 && report.products.length === 0;

  return (
    <Panel user={user} current="/relatorios" title="Relatórios">
      <div className="desk">
        <form className="desk-bar" action="/relatorios">
          <Link className="btn quiet" href={spanHref(today, today)}>Hoje</Link>
          <Link className="btn quiet" href={spanHref(shiftDay(today, -6), today)}>7 dias</Link>
          <Link className="btn quiet" href={spanHref(week.start, today < week.end ? today : week.end)}>Semana</Link>
          <Link className="btn quiet" href={spanHref(month.start, today)}>Mês</Link>
          <label>
            De
            <input name="de" type="date" defaultValue={start} required />
          </label>
          <label>
            Até
            <input name="ate" type="date" defaultValue={end} required />
          </label>
          <button className="btn" type="submit">Ver</button>
          <span className="chip">{tooLong ? `máx. ${SPAN} dias` : `${formatDay(start)} – ${formatDay(end)}`}</span>
          {lowStock.length > 0 ? (
            <Link className="chip warn" href={`/relatorios/estoque?de=${start}&ate=${end}&filtro=minimo`}>
              Estoque {lowStock.length}
            </Link>
          ) : null}
          {toCall > 0 ? (
            <Link className="chip" href={`/relatorios/clientes?de=${start}&ate=${end}`}>
              Chamar {toCall}
            </Link>
          ) : null}
        </form>
        {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
        {report && !empty ? (
          <>
            <div className="statement-totals report-totals">
              <div className="statement-total net">
                <span className="label">Recebido</span>
                <strong>{formatReais(revenue)}</strong>
                <span className="report-delta">
                  {delta == null ? "sem período anterior" : `${delta > 0 ? "+" : ""}${delta}% vs ${formatDay(previous.start)}–${formatDay(previous.end)}`}
                </span>
              </div>
              <div className="statement-total">
                <span className="label">Ticket</span>
                <strong>{formatReais(ticket)}</strong>
                <span className="report-delta">{closed} fechada{closed === 1 ? "" : "s"}</span>
              </div>
              <div className="statement-total">
                <span className="label">Agenda</span>
                <strong>{agenda}</strong>
                <span className="report-delta">falta {absentRate}% · cancela {cancelRate}%</span>
              </div>
              <div className="statement-total out">
                <span className="label">Formas</span>
                <strong>{report.methods.length}</strong>
                <span className="report-delta">
                  {report.methods[0] ? `${paymentMethodLabel(report.methods[0].name)} ${share(report.methods[0].cents, methodTotal)}` : "sem recebimento"}
                </span>
              </div>
            </div>
            <div className="queue statement-day" style={{ overflowX: "auto" }}>
              <div className="queue-head">
                <h2>Dia a dia</h2>
                <span className="meta">{report.days.length} dia{report.days.length === 1 ? "" : "s"}</span>
              </div>
              {report.days.length === 0 ? <p className="queue-empty">Nenhum recebimento neste período.</p> : null}
              {report.days.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Recebido</th>
                      <th className="num">Comandas</th>
                      <th className="num">Ticket</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.days.map((row) => (
                      <tr key={row.day}>
                        <td>{formatDay(row.day)}</td>
                        <td>
                          <span className="report-track" aria-hidden="true">
                            <span className="report-bar" style={{ transform: `scaleX(${peak > 0 ? row.cents / peak : 0})` }} />
                          </span>
                          {formatReais(row.cents)}
                        </td>
                        <td className="num">{row.orders}</td>
                        <td className="num">{formatReais(row.orders > 0 ? Math.round(row.cents / row.orders) : 0)}</td>
                        <td><Link href={`/caixa?dia=${row.day}`}>Caixa</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
            <div className="report-split">
              <div className="queue statement-day" style={{ overflowX: "auto" }}>
                <div className="queue-head"><h2>Formas</h2></div>
                {report.methods.length === 0 ? <p className="queue-empty">Nenhum recebimento.</p> : null}
                {report.methods.length > 0 ? (
                <table>
                  <thead>
                    <tr>
                      <th>Forma</th>
                      <th className="num">Qtd</th>
                      <th className="num">Valor</th>
                      <th className="num">Parte</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.methods.map((row) => (
                      <tr key={row.name}>
                        <td>{paymentMethodLabel(row.name)}</td>
                        <td className="num">{row.qty}</td>
                        <td className="num">{formatReais(row.cents)}</td>
                        <td className="num">{share(row.cents, methodTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                ) : null}
              </div>
              <div className="queue statement-day" style={{ overflowX: "auto" }}>
                <div className="queue-head"><h2>Agenda</h2></div>
                {agenda === 0 ? <p className="queue-empty">Nenhum horário neste período.</p> : null}
                {agenda > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Estado</th>
                        <th className="num">Qtd</th>
                        <th className="num">Parte</th>
                      </tr>
                    </thead>
                    <tbody>
                      {STATUS_ORDER.filter((status) => report.statuses.some((row) => row.status === status)).map((status) => {
                        const qty = report.statuses.find((row) => row.status === status)?.qty ?? 0;
                        return (
                          <tr key={status}>
                            <td>{APPOINTMENT_STATUS[status].word}</td>
                            <td className="num">{qty}</td>
                            <td className="num">{share(qty, agenda)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : null}
              </div>
            </div>
            <div className="report-grid">
              <RankTable title="Serviços" rows={report.services} />
              <RankTable
                title="Profissionais"
                rows={report.staff}
                hrefFor={(row) => row.id ? `/comissao?de=${start}&ate=${end}&profissional=${row.id}` : null}
              />
              <RankTable title="Produtos" rows={report.products} />
            </div>
          </>
        ) : null}
        {report && empty ? (
          <div className="queue">
            <p className="queue-empty">Nada neste período.</p>
          </div>
        ) : null}
        {!tooLong ? (
          <div className="desk-bar">
            <Link className="btn quiet" href="/relatorios/alertas">Alertas</Link>
            <Link className="btn quiet" href={`/relatorios/financeiro?de=${start}&ate=${end}`}>Financeiro</Link>
            <Link className="btn quiet" href={`/relatorios/agenda?de=${start}&ate=${end}`}>Agenda</Link>
            <Link className="btn quiet" href={`/relatorios/comandas?de=${start}&ate=${end}`}>Comandas</Link>
            <Link className="btn quiet" href={`/relatorios/estoque?de=${start}&ate=${end}`}>Estoque</Link>
            <Link className="btn quiet" href={`/relatorios/compras?de=${start}&ate=${end}`}>Compras</Link>
            <Link className="btn quiet" href={`/produtos/movimentos?de=${start}&ate=${end}`}>Movimentos</Link>
            <Link className="btn quiet" href={`/relatorios/clientes?de=${start}&ate=${end}`}>Clientes</Link>
            <Link className="btn quiet" href={`/relatorios/extras?de=${start}&ate=${end}`}>Extras</Link>
            <Link className="btn quiet" href={`/caixa?de=${start}&ate=${end}`}>Caixa</Link>
            <Link className="btn quiet" href={`/comissao?de=${start}&ate=${end}`}>Comissão</Link>
            {user.role === "administrador" ? (
              <Link className="btn quiet" href={`/financeiro/fluxo?mes=${end.slice(0, 7)}`}>Fluxo</Link>
            ) : null}
            <Link className="btn quiet" href={`/pacotes/relatorio?de=${start}&ate=${end}`}>Pacotes</Link>
            <Link className="btn quiet" href={`/servicos/periodo?de=${start}&ate=${end}`}>Serviços</Link>
            <Link className="btn quiet" href="/volta">Volta</Link>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
