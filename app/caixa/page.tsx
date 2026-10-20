import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { registerDrawerMove } from "@/desk/actions";
import { dayParam, daysBetween, monthBounds, shiftDay, weekBounds } from "@/desk/clock";
import { cashBook, dayCash } from "@/desk/queries";
import { PAYMENT_METHODS, paymentMethodLabel } from "@/desk/statuses";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const SPAN = 92;
const METHODS = ["dinheiro", "pix", "debito", "credito", "outros"] as const;

function methodLabel(method: string) {
  return PAYMENT_METHODS.find((item) => item.value === method)?.label ?? method;
}

function moveWord(origin: string, label: string) {
  if (origin === "consumo_interno") return "Consumo interno";
  if (origin === "sangria") return label.startsWith("Sangria") ? label : `Sangria · ${label}`;
  if (origin === "suprimento") return label.startsWith("Suprimento") ? label : `Suprimento · ${label}`;
  return label;
}

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; de?: string; ate?: string; ok?: string; erro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const today = todaySaoPaulo();
  if (query.de || query.ate) {
    let start = dayParam(query.de);
    let end = dayParam(query.ate);
    if (start > end) [start, end] = [end, start];
    const tooLong = daysBetween(start, end) > SPAN;
    const book = tooLong ? { methods: [], movements: [], banks: [] } : await cashBook(user.accountId, start, end);
    const days = [...new Set([...book.methods.map((row) => row.day), ...book.movements.map((row) => row.day), ...book.banks.map((row) => row.day)])].sort();
    const of = (day: string, method: string) =>
      book.methods.find((row) => row.day === day && row.method === method)?.amountCents ?? 0;
    const move = (day: string, origin: string) => book.movements.find((row) => row.day === day && row.origin === origin);
    const drawer = (day: string) => METHODS.reduce((sum, method) => sum + of(day, method), 0);
    const adjusted = (day: string) =>
      drawer(day) +
      (move(day, "suprimento")?.amountCents ?? 0) +
      (move(day, "sangria")?.amountCents ?? 0) +
      (move(day, "estorno")?.amountCents ?? 0);
    const bank = (day: string) => book.banks.find((row) => row.day === day)?.amountCents ?? 0;
    const month = monthBounds(today);
    const week = weekBounds(today);
    return (
      <Panel user={user} current="/caixa" title="Histórico do caixa">
        <div className="desk">
        <form className="desk-bar" action="/caixa">
          <label>
            De
            <input name="de" type="date" defaultValue={start} required />
          </label>
          <label>
            Até
            <input name="ate" type="date" defaultValue={end} required />
          </label>
          <button className="btn" type="submit">
            Ver
          </button>
          <Link className="btn quiet" href={`/caixa?de=${week.start}&ate=${week.end}`}>
            Semana
          </Link>
          <Link className="btn quiet" href={`/caixa?de=${month.start}&ate=${month.end}`}>
            Mês
          </Link>
          <Link className="btn quiet" href={`/caixa?dia=${end}`}>
            Dia
          </Link>
        </form>
        {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
        {!tooLong && days.length === 0 ? <p className="queue-empty">Nada neste período.</p> : null}
        {!tooLong && days.length > 0 ? (
          <div className="queue" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Dia</th>
                  {METHODS.map((method) => (
                    <th key={method}>{methodLabel(method)}</th>
                  ))}
                  <th>Recebido</th>
                  <th>Sangria</th>
                  <th>Suprimento</th>
                  <th>Gaveta</th>
                  <th>Banco</th>
                  <th>Taxa</th>
                  <th>Estorno</th>
                  <th>Consumo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day}>
                    <td>{formatDay(day)}</td>
                    {METHODS.map((method) => (
                      <td key={method}>{formatReais(of(day, method))}</td>
                    ))}
                    <td>{formatReais(drawer(day))}</td>
                    <td>{formatReais(move(day, "sangria")?.amountCents ?? 0)}</td>
                    <td>{formatReais(move(day, "suprimento")?.amountCents ?? 0)}</td>
                    <td>{formatReais(adjusted(day))}</td>
                    <td>{formatReais(bank(day))}</td>
                    <td>{formatReais(move(day, "taxa_cartao")?.amountCents ?? 0)}</td>
                    <td>{formatReais(move(day, "estorno")?.amountCents ?? 0)}</td>
                    <td>{move(day, "consumo_interno")?.qty ?? 0}</td>
                    <td>
                      <Link href={`/caixa?dia=${day}`}>Abrir</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  {METHODS.map((method) => (
                    <td key={method}>{formatReais(days.reduce((sum, day) => sum + of(day, method), 0))}</td>
                  ))}
                  <td>{formatReais(days.reduce((sum, day) => sum + drawer(day), 0))}</td>
                  <td>{formatReais(days.reduce((sum, day) => sum + (move(day, "sangria")?.amountCents ?? 0), 0))}</td>
                  <td>{formatReais(days.reduce((sum, day) => sum + (move(day, "suprimento")?.amountCents ?? 0), 0))}</td>
                  <td>{formatReais(days.reduce((sum, day) => sum + adjusted(day), 0))}</td>
                  <td>{formatReais(days.reduce((sum, day) => sum + bank(day), 0))}</td>
                  <td>{formatReais(days.reduce((sum, day) => sum + (move(day, "taxa_cartao")?.amountCents ?? 0), 0))}</td>
                  <td>{formatReais(days.reduce((sum, day) => sum + (move(day, "estorno")?.amountCents ?? 0), 0))}</td>
                  <td>{days.reduce((sum, day) => sum + (move(day, "consumo_interno")?.qty ?? 0), 0)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
        </div>
      </Panel>
    );
  }
  const day = dayParam(query.dia);
  const cash = await dayCash(user.accountId, day);
  const received = cash.byMethod.reduce((sum, row) => sum + row.amountCents, 0);
  const drawerAdjust = cash.movements
    .filter((row) => row.origin === "sangria" || row.origin === "suprimento" || row.origin === "estorno")
    .reduce((sum, row) => sum + row.amountCents, 0);
  const drawerNet = received + drawerAdjust;
  const banked = cash.banks.reduce((sum, row) => sum + row.amountCents, 0);
  const netCommission = cash.commissions.reduce((sum, row) => sum + row.amountCents - row.abatementCents, 0);
  const openDue = cash.openGaps.reduce((sum, row) => sum + row.gapCents, 0);

  return (
    <Panel user={user} current="/caixa" title="Caixa do dia">
      <div className="desk">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <div className="desk-bar">
        <Link className="btn quiet" href={`/caixa?dia=${shiftDay(day, -1)}`}>
          ←
        </Link>
        <span className="day-label">{formatDay(day)}</span>
        <Link className="btn quiet" href={`/caixa?dia=${shiftDay(day, 1)}`}>
          →
        </Link>
        <Link className="btn quiet" href={`/caixa?dia=${todaySaoPaulo()}`}>
          Hoje
        </Link>
        <Link className="btn quiet" href={`/comissao?de=${day}&ate=${day}`}>
          Comissão
        </Link>
        <Link className="btn quiet" href={`/caixa?de=${monthBounds(day).start}&ate=${day}`}>
          Mês
        </Link>
        <Modal label="Sangria / suprimento" title="Gaveta" tone="navy">
          <form action={registerDrawerMove}>
            <input type="hidden" name="day" value={day} />
            <div className="split">
              <label>
                Tipo
                <select name="kind" required defaultValue="sangria">
                  <option value="sangria">Sangria</option>
                  <option value="suprimento">Suprimento</option>
                </select>
              </label>
              <label>
                Valor
                <input name="amount" required placeholder="0,00" />
              </label>
            </div>
            <label>
              Motivo
              <input name="note" required minLength={2} placeholder="Troco, depósito, reforço…" />
            </label>
            <SubmitButton label="Lançar" pendingLabel="Lançando…" />
          </form>
        </Modal>
      </div>
      <div className="pulse-stats">
        <span className="chip ok">Recebido {formatReais(received)}</span>
        <span className="chip">Gaveta {formatReais(drawerNet)}</span>
        <span className="chip">Banco {formatReais(banked)}</span>
        <span className="chip">Comissão {formatReais(netCommission)}</span>
        {openDue > 0 ? (
          <Link className="chip hot" href="/comandas?lista=abertas&filtro=falta">
            Em aberto {formatReais(openDue)}
          </Link>
        ) : (
          <span className="chip">Em aberto {formatReais(0)}</span>
        )}
      </div>
      {cash.openGaps.length > 0 ? (
        <div className="desk-floor">
          <span className="label">Falta hoje</span>
          {cash.openGaps.map((row) => (
            <Link key={row.id} className="chip hot" href={`/comandas/${row.id}`}>
              {row.who} · {formatReais(row.gapCents)}
            </Link>
          ))}
        </div>
      ) : null}
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="queue-head">
          <h2>Recebimentos</h2>
          <span className="meta">{cash.receipts.length}</span>
        </div>
        {cash.receipts.length === 0 ? <p className="queue-empty">Nenhum recebimento na gaveta.</p> : null}
        {cash.receipts.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Hora</th>
                <th>Cliente</th>
                <th>Forma</th>
                <th>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cash.receipts.map((row) => (
                <tr key={row.id}>
                  <td>{row.at}</td>
                  <td>{row.who}</td>
                  <td>
                    {paymentMethodLabel(row.method)}
                    {row.feeCents > 0 ? ` · taxa ${formatReais(row.feeCents)}` : ""}
                  </td>
                  <td>{formatReais(row.amountCents)}</td>
                  <td>
                    <Link href={`/comandas/${row.orderId}`}>Comanda</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      {cash.byMethod.length > 0 ? (
        <div className="queue">
          <div className="queue-head">
            <h2>Por forma</h2>
          </div>
          {cash.byMethod.map((row) => (
            <div className="queue-row" key={row.method}>
              <strong>{methodLabel(row.method)}</strong>
              <span>{formatReais(row.amountCents)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {cash.banks.length > 0 ? (
        <div className="queue" style={{ overflowX: "auto" }}>
          <div className="queue-head">
            <h2>Banco</h2>
          </div>
          <table>
            <thead>
              <tr>
                <th>Banco</th>
                <th>Forma</th>
                <th>Valor</th>
                <th>Taxa</th>
              </tr>
            </thead>
            <tbody>
              {cash.banks.map((row) => (
                <tr key={`${row.bank}-${row.method}`}>
                  <td>{row.bank}</td>
                  <td>{methodLabel(row.method)}</td>
                  <td>{formatReais(row.amountCents)}</td>
                  <td>{formatReais(row.feeCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {cash.movements.length > 0 ? (
        <div className="queue">
          <div className="queue-head">
            <h2>Movimentos</h2>
          </div>
          {cash.movements.map((row) => (
            <div className="queue-row" key={row.id}>
              <span>{moveWord(row.origin, row.label)}</span>
              <strong>{formatReais(row.amountCents)}</strong>
            </div>
          ))}
        </div>
      ) : null}
      {cash.commissions.length > 0 ? (
        <div className="queue" style={{ overflowX: "auto" }}>
          <div className="queue-head">
            <h2>Comissão</h2>
            <Link className="meta" href={`/comissao?de=${day}&ate=${day}`}>
              Abrir
            </Link>
          </div>
          <table>
            <thead>
              <tr>
                <th>Pessoa</th>
                <th>Comissão</th>
                <th>Abate</th>
                <th>Líquido</th>
              </tr>
            </thead>
            <tbody>
              {cash.commissions.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{formatReais(row.amountCents)}</td>
                  <td>{formatReais(row.abatementCents)}</td>
                  <td>{formatReais(row.amountCents - row.abatementCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      </div>
    </Panel>
  );
}
