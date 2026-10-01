import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, shiftDay } from "@/desk/clock";
import { dayCash } from "@/desk/queries";
import { PAYMENT_METHODS } from "@/desk/statuses";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const day = dayParam(query.dia);
  const cash = await dayCash(user.accountId, day);
  const received = cash.byMethod.reduce((sum, row) => sum + row.amountCents, 0);

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
      </div>
      <div className="tiles">
        <div className="stat">
          <strong>{formatReais(received)}</strong>
          <span>Recebido</span>
        </div>
      </div>
      <div className="card">
        <h2>Por forma</h2>
        {cash.byMethod.length === 0 ? <p>Nenhum pagamento neste dia.</p> : null}
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
        <h2>Movimentos</h2>
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
        <p>Nasce na linha. Cortesia continua comissionando o valor de tabela. Consumo abate, sem comissão de produto.</p>
        {cash.commissions.length === 0 ? <p>Nenhuma linha com profissional neste dia.</p> : null}
        {cash.commissions.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Profissional</th>
                <th>Comissão</th>
                <th>Abate</th>
              </tr>
            </thead>
            <tbody>
              {cash.commissions.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{formatReais(row.amountCents)}</td>
                  <td>{formatReais(row.abatementCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
