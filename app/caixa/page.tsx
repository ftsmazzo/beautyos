import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds, shiftDay, weekBounds } from "@/desk/clock";
import { cashBook, dayCash } from "@/desk/queries";
import { PAYMENT_METHODS } from "@/desk/statuses";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const SPAN = 92;
const METHODS = ["dinheiro", "pix", "debito", "credito", "outros"] as const;

function methodLabel(method: string) {
  return PAYMENT_METHODS.find((item) => item.value === method)?.label ?? method;
}

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; de?: string; ate?: string }>;
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
    const bank = (day: string) => book.banks.find((row) => row.day === day)?.amountCents ?? 0;
    const month = monthBounds(today);
    const week = weekBounds(today);
    return (
      <Panel user={user} current="/caixa" title="Histórico do caixa">
        <p>A gaveta fica separada do banco. O banco é o que entrou no extrato neste período. A taxa de cartão e o estorno aparecem à parte. Consumo interno entra com valor zero.</p>
        <form className="row" action="/caixa">
          <label>
            De
            <input name="de" type="date" defaultValue={start} required />
          </label>
          <label>
            Até
            <input name="ate" type="date" defaultValue={end} required />
          </label>
          <button className="btn" type="submit">
            Ver período
          </button>
        </form>
        <div className="row">
          <Link className="btn quiet" href={`/caixa?de=${week.start}&ate=${week.end}`}>
            Esta semana
          </Link>
          <Link className="btn quiet" href={`/caixa?de=${month.start}&ate=${month.end}`}>
            Este mês
          </Link>
          <Link className="btn quiet" href={`/caixa?dia=${end}`}>
            Voltar ao dia
          </Link>
        </div>
        {tooLong ? <p className="error">O período fica em até {SPAN} dias.</p> : null}
        {!tooLong && days.length === 0 ? <p>Nada na gaveta nem no banco neste período.</p> : null}
        {!tooLong && days.length > 0 ? (
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Dia</th>
                  {METHODS.map((method) => (
                    <th key={method}>{methodLabel(method)}</th>
                  ))}
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
      </Panel>
    );
  }
  const day = dayParam(query.dia);
  const cash = await dayCash(user.accountId, day);
  const received = cash.byMethod.reduce((sum, row) => sum + row.amountCents, 0);
  const banked = cash.banks.reduce((sum, row) => sum + row.amountCents, 0);
  const netCommission = cash.commissions.reduce((sum, row) => sum + row.amountCents - row.abatementCents, 0);
  const openDue = cash.openGaps.reduce((sum, row) => sum + row.gapCents, 0);

  return (
    <Panel user={user} current="/caixa" title="Caixa do dia">
      <div className="row">
        <Link className="btn quiet" href={`/caixa?dia=${shiftDay(day, -1)}`}>
          Dia anterior
        </Link>
        <strong>{formatDay(day)}</strong>
        <Link className="btn quiet" href={`/caixa?dia=${shiftDay(day, 1)}`}>
          Próximo dia
        </Link>
        <Link className="btn quiet" href={`/caixa?dia=${todaySaoPaulo()}`}>
          Hoje
        </Link>
        <Link className="btn quiet" href={`/comissao?de=${day}&ate=${day}`}>
          Comissão deste dia
        </Link>
        <Link className="btn quiet" href={`/caixa?de=${monthBounds(day).start}&ate=${day}`}>
          Histórico do mês
        </Link>
      </div>
      <div className="tiles">
        <div className="stat">
          <strong>{formatReais(received)}</strong>
          <span>Gaveta</span>
        </div>
        <div className="stat">
          <strong>{formatReais(banked)}</strong>
          <span>Banco</span>
        </div>
        <div className="stat">
          <strong>{formatReais(netCommission)}</strong>
          <span>Comissão líquida</span>
        </div>
        <div className="stat">
          <strong>{formatReais(openDue)}</strong>
          <span>Ainda em aberto</span>
        </div>
      </div>
      <div className="card">
        <h2>Por forma</h2>
        <p>O que entrou na gaveta. Recebimento no banco fica no extrato.</p>
        {cash.byMethod.length === 0 ? <p>Nenhum pagamento na gaveta neste dia.</p> : null}
        {cash.byMethod.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Forma</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {cash.byMethod.map((row) => (
                <tr key={row.method}>
                  <td>{PAYMENT_METHODS.find((method) => method.value === row.method)?.label ?? row.method}</td>
                  <td>{formatReais(row.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      <div className="card">
        <h2>Banco</h2>
        <p>Recebimento que entrou no extrato. Não soma na gaveta. A taxa continua no movimento do caixa.</p>
        {cash.banks.length === 0 ? <p>Nenhum recebimento no banco neste dia.</p> : null}
        {cash.banks.length > 0 ? (
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
        ) : null}
      </div>
      <div className="card">
        <h2>Ainda em aberto</h2>
        <p>
          Comanda deste dia que ainda não cobriu o total.{" "}
          <Link href="/comandas?lista=abertas&filtro=falta">Fila a receber</Link>
        </p>
        {cash.openGaps.length === 0 ? <p>Nenhuma falta neste dia.</p> : null}
        {cash.openGaps.map((row) => (
          <p key={row.id}>
            <Link href={`/comandas/${row.id}`}>{row.who}</Link>
            {` · falta ${formatReais(row.gapCents)}`}
          </p>
        ))}
      </div>
      <div className="card">
        <h2>Movimentos</h2>
        <p>A taxa de cartão aparece aqui, separada. Metade sai da comissão de quem executou.</p>
        {cash.movements.length === 0 ? <p>Nada lançado neste dia.</p> : null}
        {cash.movements.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Origem</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {cash.movements.map((row, index) => (
                <tr key={`${row.label}-${index}`}>
                  <td>{row.origin === "consumo_interno" ? "Consumo interno" : row.label}</td>
                  <td>{formatReais(row.amountCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      <div className="card">
        <h2>Comissão do dia</h2>
        <p>Nasce na linha. Cortesia continua comissionando o valor de tabela. Consumo abate, sem comissão de produto. Indicação soma na pessoa que trouxe, por cima de quem executou. No serviço entre profissionais, a comissão fica com quem executou e o valor com desconto abate quem recebeu.</p>
        {cash.commissions.length === 0 ? <p>Nenhuma linha com profissional neste dia.</p> : null}
        {cash.commissions.length > 0 ? (
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
        ) : null}
      </div>
    </Panel>
  );
}
