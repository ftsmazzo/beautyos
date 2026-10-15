import Link from "next/link";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatPhone, formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, shiftDay } from "@/desk/clock";
import { openDayOrder, openDuePackageVisits } from "@/desk/actions";
import { clientOptions, dayOrders, linkedProfessional } from "@/desk/queries";
import { ErrorNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; erro?: string }>;
}) {
  const user = await requireDesk();
  const query = await searchParams;
  const day = dayParam(query.dia);
  await openDuePackageVisits(user.accountId, user.id, day);
  const operator = user.role === "administrador" || user.role === "balcao";
  const own = user.role === "profissional" ? await linkedProfessional(user.id) : null;
  const [orders, clients] = await Promise.all([
    dayOrders(user.accountId, day, own),
    operator ? clientOptions(user.accountId) : Promise.resolve([]),
  ]);

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
        {operator ? (
          <Link className="btn quiet" href="/pacotes/vendidos">
            Prazos dos pacotes
          </Link>
        ) : null}
      </div>
      <ErrorNote code={query.erro} />
      {operator ? (
        <form action={openDayOrder} className="card">
          <h2>Comanda do dia</h2>
          <p>Produto entra sem horário. Serviço entra na comanda e precisa de profissional e hora para fechar. Quem já tem comanda neste dia abre a mesma.</p>
          <input type="hidden" name="day" value={day} />
          <label>
            Cliente
            <select name="client" required defaultValue="">
              <option value="" disabled>
                Escolha
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                  {client.phone ? ` · ${formatPhone(client.phone)}` : ""}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton label="Abrir comanda" pendingLabel="Abrindo…" />
        </form>
      ) : null}
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
                    {order.packageNote ? <div>{order.packageNote}</div> : null}
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
