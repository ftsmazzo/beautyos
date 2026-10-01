import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatPhone, formatReais } from "@/catalog/format";
import {
  addConsumption,
  addPayment,
  addProduct,
  attachClient,
  closeOrder,
  reopenOrder,
  removePayment,
  setStatus,
  toggleCourtesy,
  toggleFromOutside,
} from "@/desk/actions";
import { clientOptions, consumptionProducts, getOrder, linkedProfessional, productOptions } from "@/desk/queries";
import { APPOINTMENT_STATUS, PAYMENT_METHODS } from "@/desk/statuses";
import { ErrorNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireDesk();
  const { id } = await params;
  const query = await searchParams;
  const order = await getOrder(user.accountId, id);
  if (!order) redirect("/comandas");
  const own = user.role === "profissional" ? await linkedProfessional(user.id) : null;
  const involved = !own || order.professionalId === own || order.lines.some((line) => line.professionalId === own);
  if (!involved) redirect("/comandas");
  const operator = user.role === "administrador" || user.role === "balcao";
  const open = order.status === "aberta";
  const total = order.lines.reduce((sum, line) => sum + line.priceCents, 0);
  const paid = order.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const people = order.incomplete ? await clientOptions(user.accountId) : [];
  const products = order.kind === "cliente" && open ? await productOptions(user.accountId) : [];
  const stock = order.kind === "consumo" && open ? await consumptionProducts(user.accountId) : [];
  const statuses = Object.entries(APPOINTMENT_STATUS).filter(([value]) => value !== "bloqueado");

  return (
    <Panel user={user} current="/comandas" title={order.kind === "consumo" ? "Consumo" : "Comanda"}>
      <div className="row">
        <Link className="btn quiet" href={`/comandas?dia=${order.day}`}>
          Comandas do dia
        </Link>
        <Link className="btn quiet" href={`/agenda?dia=${order.day}`}>
          Agenda
        </Link>
      </div>
      <ErrorNote code={query.erro} />
      <div className="card">
        <div className="split">
          <div>
            <strong>{order.kind === "consumo" ? order.professionalName ?? "Profissional" : order.clientName ?? "Sem nome"}</strong>
            {order.phone ? <p>{formatPhone(order.phone)}</p> : null}
            <p>
              {formatDay(order.day)} · {open ? "Aberta" : "Fechada"}
              {order.fromOutside ? " · De fora" : ""}
              {order.incomplete ? " · Cadastro pendente" : ""}
            </p>
          </div>
          <div>
            <p>Total {formatReais(total)}</p>
            <p>Pago {formatReais(paid)}</p>
            <p>{paid >= total ? "Coberta" : `Falta ${formatReais(total - paid)}`}</p>
          </div>
        </div>
        {operator && order.clientId ? (
          <form action={toggleFromOutside}>
            <input type="hidden" name="order" value={order.id} />
            <input type="hidden" name="client" value={order.clientId} />
            <SubmitButton
              label={order.fromOutside ? "Tirar de fora" : "Marcar de fora"}
              pendingLabel="Salvando…"
              className="amber"
            />
          </form>
        ) : null}
      </div>

      {operator && order.incomplete && open ? (
        <div className="card">
          <h2>Completar o sem nome</h2>
          <form action={attachClient}>
            <input type="hidden" name="order" value={order.id} />
            <label>
              Cliente já cadastrado
              <select name="client" defaultValue="">
                <option value="">Cadastrar agora</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="split">
              <label>
                Nome
                <input name="name" />
              </label>
              <label>
                Celular
                <input name="phone" inputMode="numeric" />
              </label>
            </div>
            <p>Se essa pessoa já tiver comanda neste dia, as linhas entram nela. Continua o mesmo atendimento.</p>
            <SubmitButton label="Completar" pendingLabel="Salvando…" />
          </form>
        </div>
      ) : null}

      <div className="card">
        {order.lines.length === 0 ? <p>Nenhuma linha ainda.</p> : null}
        {order.lines.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Profissional</th>
                <th>Horário</th>
                <th>Valor</th>
                <th>Comissão</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td>
                    {line.description}
                    {line.qty > 1 ? ` × ${line.qty}` : ""}
                    {line.courtesy ? " · cortesia" : ""}
                    {line.encaixe ? " · encaixe" : ""}
                  </td>
                  <td>{line.professionalName ?? "—"}</td>
                  <td>{line.start && line.end ? `${line.start}–${line.end}` : "—"}</td>
                  <td>{formatReais(line.priceCents)}</td>
                  <td>
                    {formatReais(line.commissionCents)}
                    {line.abatementCents > 0 ? ` · abate ${formatReais(line.abatementCents)}` : ""}
                  </td>
                  <td>
                    <div className="line-actions">
                    {open && line.appointmentId && line.appointmentStatus ? (
                      <form action={setStatus}>
                        <input type="hidden" name="order" value={order.id} />
                        <input type="hidden" name="appointment" value={line.appointmentId} />
                        <select name="status" defaultValue={line.appointmentStatus}>
                          {statuses.map(([value, paint]) => (
                            <option key={value} value={value}>
                              {paint.word}
                            </option>
                          ))}
                        </select>
                        <SubmitButton label="Estado" pendingLabel="Salvando…" className="quiet" />
                      </form>
                    ) : null}
                    {operator && open && order.kind === "cliente" ? (
                      <form action={toggleCourtesy}>
                        <input type="hidden" name="order" value={order.id} />
                        <input type="hidden" name="line" value={line.id} />
                        <SubmitButton
                          label={line.courtesy ? "Cobrar" : "Cortesia"}
                          pendingLabel="Salvando…"
                          className="quiet"
                        />
                      </form>
                    ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {open && order.kind === "cliente" && products.length > 0 ? (
          <Modal label="Produto" title="Produto na comanda" tone="teal">
            <form action={addProduct}>
              <input type="hidden" name="order" value={order.id} />
              <label>
                Produto
                <select name="product" required defaultValue={products[0]?.id}>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} · {formatReais(product.priceCents)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Quantidade
                <input name="qty" type="number" min={1} defaultValue={1} required />
              </label>
              <SubmitButton label="Lançar" pendingLabel="Lançando…" className="teal" />
            </form>
          </Modal>
        ) : null}
        {open && order.kind === "consumo" && stock.length > 0 ? (
          <Modal label="Produto consumido" title="Consumo interno" tone="teal">
            <form action={addConsumption}>
              <input type="hidden" name="order" value={order.id} />
              <label>
                Produto
                <select name="product" required defaultValue={stock[0]?.id}>
                  {stock.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </label>
              <p>Baixa uma unidade. Não gera comissão. O abate sai do preço de consumo.</p>
              <SubmitButton label="Lançar consumo" pendingLabel="Lançando…" className="teal" />
            </form>
          </Modal>
        ) : null}
      </div>

      {order.kind === "cliente" ? (
        <div className="card">
          <h2>Pagamentos</h2>
          {order.payments.length === 0 ? <p>Nenhum pagamento ainda. Pagamento parcial deixa a comanda aberta.</p> : null}
          {order.payments.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Forma</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {order.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{PAYMENT_METHODS.find((method) => method.value === payment.method)?.label ?? payment.method}</td>
                    <td>{formatReais(payment.amountCents)}</td>
                    <td>
                      {operator && open ? (
                        <form action={removePayment}>
                          <input type="hidden" name="order" value={order.id} />
                          <input type="hidden" name="payment" value={payment.id} />
                          <SubmitButton label="Remover" pendingLabel="Removendo…" className="quiet" />
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
          {operator && open ? (
            <form action={addPayment}>
              <input type="hidden" name="order" value={order.id} />
              <div className="split">
                <label>
                  Forma
                  <select name="method" defaultValue="pix">
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Valor
                  <input name="amount" inputMode="decimal" placeholder="0,00" required />
                </label>
              </div>
              <SubmitButton label="Lançar pagamento" pendingLabel="Lançando…" />
            </form>
          ) : null}
        </div>
      ) : (
        <div className="card">
          <p>Consumo interno não recebe dinheiro. No caixa do dia a linha fecha zerada.</p>
        </div>
      )}

      {operator ? (
        <form action={open ? closeOrder : reopenOrder}>
          <input type="hidden" name="order" value={order.id} />
          <SubmitButton
            label={open ? "Fechar" : "Reabrir"}
            pendingLabel={open ? "Fechando…" : "Reabrindo…"}
            className={open ? undefined : "quiet"}
          />
        </form>
      ) : null}
    </Panel>
  );
}
