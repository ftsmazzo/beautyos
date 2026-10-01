import Link from "next/link";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatPhone, formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, shiftDay } from "@/desk/clock";
import { dayOrders, linkedProfessional } from "@/desk/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const user = await requireDesk();
  const query = await searchParams;
  const day = dayParam(query.dia);
  const own = user.role === "profissional" ? await linkedProfessional(user.id) : null;
  const orders = await dayOrders(user.accountId, day, own);

  return (
    <Panel user={user} current="/comandas" title="Comandas">
      <div className="row">
        <Link className="btn quiet" href={`/comandas?dia=${shiftDay(day, -1)}`}>
          Dia anterior
        </Link>
        <strong>{formatDay(day)}</strong>
        <Link className="btn quiet" href={`/comandas?dia=${shiftDay(day, 1)}`}>
          Próximo dia
        </Link>
        <Link className="btn quiet" href={`/comandas?dia=${todaySaoPaulo()}`}>
          Hoje
        </Link>
        <Link className="btn" href={`/agenda?dia=${day}`}>
          Agenda do dia
        </Link>
      </div>
      <div className="card">
        {orders.length === 0 ? <p>Nenhuma comanda neste dia.</p> : null}
        {orders.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Quem</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th>Total</th>
                <th>Pago</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <strong>{order.kind === "consumo" ? `Consumo · ${order.professionalName ?? "profissional"}` : order.clientName ?? "Sem nome"}</strong>
                    {order.phone ? <div>{formatPhone(order.phone)}</div> : null}
                    {order.incomplete ? <div>Cadastro pendente</div> : null}
                  </td>
                  <td>{order.kind === "consumo" ? "Consumo" : "Cliente"}</td>
                  <td>{order.status === "fechada" ? "Fechada" : "Aberta"}</td>
                  <td>{formatReais(order.totalCents)}</td>
                  <td>{formatReais(order.paidCents)}</td>
                  <td>
                    <Link href={`/comandas/${order.id}`}>Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
