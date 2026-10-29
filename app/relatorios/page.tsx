import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { productsAtMinimum } from "@/catalog/queries";
import { dayParam, daysBetween, monthBounds, shiftDay, weekBounds } from "@/desk/clock";
import { clientSilence, deltaPercent, LOST_AFTER, managementReport, previousSpan, type ReportSlice } from "@/desk/reports";
import { APPOINTMENT_STATUS, paymentMethodLabel } from "@/desk/statuses";
import { Panel } from "@/ui/panel";
import { ReportBarChart, ReportDonut } from "@/ui/report-charts";

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
    <div className="card">
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
      </div>
      <div className="table-responsive">
        {rows.length === 0 ? <p className="text-secondary p-3 mb-0">Nada neste período.</p> : null}
        {rows.length > 0 ? (
          <table className="table table-vcenter card-table table-striped">
            <thead>
              <tr>
                <th className="w-1">#</th>
                <th>Nome</th>
                <th className="text-end">Qtd</th>
                <th className="text-end">Valor</th>
                <th className="text-end">Parte</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const href = hrefFor?.(row) ?? null;
                const part = total > 0 ? row.cents / total : 0;
                return (
                  <tr key={`${row.name}-${index}`}>
                    <td className="text-secondary">{index + 1}</td>
                    <td>{href ? <Link href={href}>{row.name}</Link> : row.name}</td>
                    <td className="text-end">{row.qty}</td>
                    <td className="text-end">{formatReais(row.cents)}</td>
                    <td className="text-end" style={{ minWidth: "7.5rem" }}>
                      <div className="progress progress-sm mb-1">
                        <div className="progress-bar" style={{ width: `${Math.round(part * 1000) / 10}%` }} />
                      </div>
                      <span className="text-secondary">{share(row.cents, total)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
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
      <div className="row row-cards mb-3">
        <div className="col-12">
          <div className="card">
            <div className="card-body">
              <form className="row g-2 align-items-end" action="/relatorios">
                <div className="col-auto">
                  <div className="btn-list">
                    <Link className="btn btn-outline" href={spanHref(today, today)}>Hoje</Link>
                    <Link className="btn btn-outline" href={spanHref(shiftDay(today, -6), today)}>7 dias</Link>
                    <Link className="btn btn-outline" href={spanHref(week.start, today < week.end ? today : week.end)}>Semana</Link>
                    <Link className="btn btn-outline" href={spanHref(month.start, today)}>Mês</Link>
                  </div>
                </div>
                <div className="col-auto">
                  <label className="form-label">De</label>
                  <input className="form-control" name="de" type="date" defaultValue={start} required />
                </div>
                <div className="col-auto">
                  <label className="form-label">Até</label>
                  <input className="form-control" name="ate" type="date" defaultValue={end} required />
                </div>
                <div className="col-auto">
                  <button className="btn btn-primary" type="submit">Ver</button>
                </div>
                <div className="col-auto">
                  <span className="badge bg-azure-lt text-azure">
                    {tooLong ? `máx. ${SPAN} dias` : `${formatDay(start)} – ${formatDay(end)}`}
                  </span>
                </div>
                {lowStock.length > 0 ? (
                  <div className="col-auto">
                    <Link className="badge bg-orange-lt text-orange" href={`/relatorios/estoque?de=${start}&ate=${end}&filtro=minimo`}>
                      Estoque {lowStock.length}
                    </Link>
                  </div>
                ) : null}
                {toCall > 0 ? (
                  <div className="col-auto">
                    <Link className="badge bg-blue-lt text-blue" href={`/relatorios/clientes?de=${start}&ate=${end}`}>
                      Chamar {toCall}
                    </Link>
                  </div>
                ) : null}
              </form>
            </div>
          </div>
        </div>
      </div>

      {tooLong ? <div className="alert alert-warning">Período máximo: {SPAN} dias.</div> : null}

      {report && !empty ? (
        <>
          <div className="row row-deck row-cards mb-3">
            <div className="col-sm-6 col-lg-3">
              <div className="card">
                <div className="card-body">
                  <div className="subheader">Recebido</div>
                  <div className="h1 mb-1">{formatReais(revenue)}</div>
                  <div className="text-secondary">
                    {delta == null
                      ? "sem período anterior"
                      : `${delta > 0 ? "+" : ""}${delta}% vs ${formatDay(previous.start)}–${formatDay(previous.end)}`}
                  </div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="card">
                <div className="card-body">
                  <div className="subheader">Ticket</div>
                  <div className="h1 mb-1">{formatReais(ticket)}</div>
                  <div className="text-secondary">{closed} fechada{closed === 1 ? "" : "s"}</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="card">
                <div className="card-body">
                  <div className="subheader">Agenda</div>
                  <div className="h1 mb-1">{agenda}</div>
                  <div className="text-secondary">falta {absentRate}% · cancela {cancelRate}%</div>
                </div>
              </div>
            </div>
            <div className="col-sm-6 col-lg-3">
              <div className="card">
                <div className="card-body">
                  <div className="subheader">Formas</div>
                  <div className="h1 mb-1">{report.methods.length}</div>
                  <div className="text-secondary">
                    {report.methods[0]
                      ? `${paymentMethodLabel(report.methods[0].name)} ${share(report.methods[0].cents, methodTotal)}`
                      : "sem recebimento"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="row row-deck row-cards mb-3">
            <div className="col-12">
              <ReportBarChart
                title="Recebido por dia"
                meta={`${report.days.length} dia${report.days.length === 1 ? "" : "s"}`}
                points={report.days.map((row) => ({
                  label: row.day.slice(8),
                  value: row.cents,
                  hint: `${row.orders} comanda${row.orders === 1 ? "" : "s"}`,
                }))}
                valueKind="money"
              />
            </div>
          </div>

          <div className="row row-deck row-cards mb-3">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">Dia a dia</h3>
                  <div className="card-actions text-secondary">
                    {report.days.length} dia{report.days.length === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="table-responsive">
                  {report.days.length === 0 ? (
                    <p className="text-secondary p-3 mb-0">Nenhum recebimento neste período.</p>
                  ) : (
                    <table className="table table-vcenter card-table table-striped">
                      <thead>
                        <tr>
                          <th>Dia</th>
                          <th>Recebido</th>
                          <th className="text-end">Comandas</th>
                          <th className="text-end">Ticket</th>
                          <th className="w-1"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.days.map((row) => (
                          <tr key={row.day}>
                            <td>{formatDay(row.day)}</td>
                            <td style={{ minWidth: "10rem" }}>
                              <div className="progress progress-sm mb-1">
                                <div
                                  className="progress-bar bg-primary"
                                  style={{ width: `${peak > 0 ? Math.round((row.cents / peak) * 1000) / 10 : 0}%` }}
                                />
                              </div>
                              {formatReais(row.cents)}
                            </td>
                            <td className="text-end">{row.orders}</td>
                            <td className="text-end">{formatReais(row.orders > 0 ? Math.round(row.cents / row.orders) : 0)}</td>
                            <td>
                              <Link className="btn btn-sm btn-outline" href={`/caixa?dia=${row.day}`}>
                                Caixa
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="row row-deck row-cards mb-3">
            <div className="col-lg-6">
              <ReportDonut
                title="Formas de pagamento"
                empty="Nenhum recebimento."
                valueKind="money"
                slices={report.methods.map((row) => ({
                  label: paymentMethodLabel(row.name),
                  value: row.cents,
                }))}
              />
            </div>
            <div className="col-lg-6">
              <ReportDonut
                title="Agenda por estado"
                empty="Nenhum horário neste período."
                valueKind="number"
                slices={STATUS_ORDER.filter((status) => report.statuses.some((row) => row.status === status)).map((status) => ({
                  label: APPOINTMENT_STATUS[status].word,
                  value: report.statuses.find((row) => row.status === status)?.qty ?? 0,
                }))}
              />
            </div>
          </div>

          <div className="row row-deck row-cards mb-3">
            <div className="col-lg-4">
              <RankTable title="Serviços" rows={report.services} />
            </div>
            <div className="col-lg-4">
              <RankTable
                title="Profissionais"
                rows={report.staff}
                hrefFor={(row) => (row.id ? `/comissao?de=${start}&ate=${end}&profissional=${row.id}` : null)}
              />
            </div>
            <div className="col-lg-4">
              <RankTable title="Produtos" rows={report.products} />
            </div>
          </div>
        </>
      ) : null}

      {report && empty ? (
        <div className="card">
          <div className="card-body text-secondary">Nada neste período.</div>
        </div>
      ) : null}

      {!tooLong ? (
        <div className="card mt-3">
          <div className="card-body">
            <div className="btn-list">
              <Link className="btn btn-outline" href="/relatorios/alertas">Alertas</Link>
              <Link className="btn btn-outline" href={`/relatorios/financeiro?de=${start}&ate=${end}`}>Financeiro</Link>
              <Link className="btn btn-outline" href={`/relatorios/agenda?de=${start}&ate=${end}`}>Agenda</Link>
              <Link className="btn btn-outline" href={`/relatorios/comandas?de=${start}&ate=${end}`}>Comandas</Link>
              <Link className="btn btn-outline" href={`/relatorios/estoque?de=${start}&ate=${end}`}>Estoque</Link>
              <Link className="btn btn-outline" href={`/relatorios/compras?de=${start}&ate=${end}`}>Compras</Link>
              <Link className="btn btn-outline" href={`/produtos/movimentos?de=${start}&ate=${end}`}>Movimentos</Link>
              <Link className="btn btn-outline" href={`/relatorios/clientes?de=${start}&ate=${end}`}>Clientes</Link>
              <Link className="btn btn-outline" href={`/relatorios/extras?de=${start}&ate=${end}`}>Extras</Link>
              <Link className="btn btn-outline" href={`/caixa?de=${start}&ate=${end}`}>Caixa</Link>
              <Link className="btn btn-outline" href={`/comissao?de=${start}&ate=${end}`}>Comissão</Link>
              {user.role === "administrador" ? (
                <Link className="btn btn-outline" href={`/financeiro/fluxo?mes=${end.slice(0, 7)}`}>Fluxo</Link>
              ) : null}
              <Link className="btn btn-outline" href={`/pacotes/relatorio?de=${start}&ate=${end}`}>Pacotes</Link>
              <Link className="btn btn-outline" href={`/servicos/periodo?de=${start}&ate=${end}`}>Serviços</Link>
              <Link className="btn btn-outline" href="/volta">Volta</Link>
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
