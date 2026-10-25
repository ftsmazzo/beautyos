import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, formatReais, packageDeadline, todaySaoPaulo } from "@/catalog/format";
import { CHANNELS, channelLabel } from "@/catalog/labels";
import { getClient, houseRules, listClients, listProfessionals } from "@/catalog/queries";
import { saveClient } from "@/catalog/client-actions";
import { openDayOrder } from "@/desk/actions";
import { clientBrief, clientLedger } from "@/desk/queries";
import { APPOINTMENT_STATUS } from "@/desk/statuses";
import { ErrorNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ClientFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireOperator();
  const { id } = await params;
  const query = await searchParams;
  const creating = id === "novo";
  if (!creating && !UUID.test(id)) redirect("/clientes");
  const person = creating ? null : await getClient(user.accountId, id);
  if (!creating && !person) redirect("/clientes");
  const [rules, professionals, clients, brief, ledger] = await Promise.all([
    houseRules(user.accountId),
    listProfessionals(user.accountId),
    listClients(user.accountId, false, ""),
    person ? clientBrief(user.accountId, person.id, person.fromOutside) : Promise.resolve(null),
    person ? clientLedger(user.accountId, person.id) : Promise.resolve(null),
  ]);
  const today = todaySaoPaulo();
  const channel = channelLabel(person?.channel ?? "nao_informado");

  const editor = (
      <form action={saveClient}>
        {person ? <input type="hidden" name="id" value={person.id} /> : null}
        <div className="split">
          <label>
            Nome
            <input name="name" required minLength={2} defaultValue={person?.name ?? ""} />
          </label>
          <label>
            Celular
            <input name="phone" required defaultValue={person ? formatPhone(person.phone) : ""} />
          </label>
        </div>
        <div className="split">
          <label>
            E-mail
            <input name="email" type="email" defaultValue={person?.email ?? ""} />
          </label>
          <label>
            Nascimento
            <input name="birth" type="date" defaultValue={person?.birthDate ?? ""} />
          </label>
        </div>
        <label>
          Observação
          <textarea name="notes" defaultValue={person?.notes ?? ""} />
        </label>
        <label>
          Canal de chegada
          <select name="channel" defaultValue={person?.channel ?? "nao_informado"}>
            {CHANNELS.map((channel) => (
              <option key={channel.value} value={channel.value}>
                {channel.label}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label className="check">
            <input type="checkbox" name="from_outside" value="1" defaultChecked={person?.fromOutside ?? false} />
            De fora
          </label>
          <label className="check">
            <input type="checkbox" name="incomplete" value="1" defaultChecked={person?.incomplete ?? false} />
            Cadastro incompleto
          </label>
          <label className="check">
            <input type="checkbox" name="active" value="1" defaultChecked={person?.active ?? true} />
            Ativo
          </label>
        </div>
        <h2>Indicação</h2>
        <div className="split">
          <label>
            Profissional que indicou
            <select name="referrer_professional" defaultValue={person?.referrerProfessionalId ?? ""}>
              <option value="">Ninguém</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cliente que indicou
            <select name="referrer_client" defaultValue={person?.referrerClientId ?? ""}>
              <option value="">Ninguém</option>
              {clients
                .filter((client) => client.id !== person?.id)
                .map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Comissão desta indicação (%)
            <input
              name="referral_commission"
              inputMode="numeric"
              placeholder={String(rules.referral)}
              defaultValue={person?.referralCommissionPercent ?? ""}
            />
          </label>
        </div>
        <details>
          <summary>Documento e endereço</summary>
          <div className="split">
            <label>
              Telefone fixo
              <input name="landline" defaultValue={person?.landline ?? ""} />
            </label>
            <label>
              CPF
              <input name="cpf" defaultValue={person?.cpf ?? ""} />
            </label>
            <label>
              RG
              <input name="rg" defaultValue={person?.rg ?? ""} />
            </label>
            <label>
              Sexo
              <input name="sex" defaultValue={person?.sex ?? ""} />
            </label>
          </div>
          <label>
            Endereço
            <textarea name="address" defaultValue={person?.address ?? ""} />
          </label>
        </details>
        <SubmitButton label="Salvar cliente" />
      </form>
  );

  const desk = person && brief ? (
        <div className="desk">
          <div className="desk-bar">
            <span className="chip">{formatPhone(person.phone)}</span>
            {brief.money.dueCents > 0 ? (
              <Link className="chip hot" href="/comandas?lista=abertas&filtro=falta">
                A receber {formatReais(brief.money.dueCents)}
              </Link>
            ) : null}
            {ledger && ledger.creditCents > 0 ? <span className="chip">Crédito {formatReais(ledger.creditCents)}</span> : null}
            {person.channel !== "nao_informado" ? <span className="chip">{channel}</span> : null}
            {person.incomplete ? <span className="chip">Incompleto</span> : null}
            {person.fromOutside ? <span className="chip">De fora</span> : null}
            {person.active ? null : <span className="chip">inativo</span>}
            <Modal label="Editar" title={`Editar · ${person.name}`} tone="navy">
              {editor}
            </Modal>
            <form action={openDayOrder}>
              <input type="hidden" name="from" value="cliente" />
              <input type="hidden" name="client" value={person.id} />
              <input type="hidden" name="day" value={today} />
              <SubmitButton label="Comanda de hoje" pendingLabel="Abrindo…" />
            </form>
          </div>
          {brief.agenda.length > 0 ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="desk-bar"><span className="day-label">Agenda</span></div>
              <table>
                <tbody>
                  {brief.agenda.map((visit) => (
                    <tr key={visit.id}>
                      <td>{formatDay(visit.day)} {visit.time}</td>
                      <td>{visit.service}</td>
                      <td>{visit.professional}</td>
                      <td>{APPOINTMENT_STATUS[visit.status as keyof typeof APPOINTMENT_STATUS]?.word ?? visit.status}</td>
                      <td>{visit.orderId ? <Link href={`/comandas/${visit.orderId}`}>Comanda</Link> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {brief.returns.length > 0 ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="desk-bar"><span className="day-label">Volta</span></div>
              <table>
                <tbody>
                  {brief.returns.map((row) => (
                    <tr key={row.serviceId}>
                      <td>{row.service}</td>
                      <td>{row.word}{row.returnOn ? ` · ${formatDay(row.returnOn)}` : ""}</td>
                      <td>{formatDay(row.day)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {brief.orders.some((order) => order.paidCents !== order.totalCents) ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="desk-bar"><span className="day-label">Conta</span></div>
              <table>
                <tbody>
                  {brief.orders
                    .filter((order) => order.paidCents !== order.totalCents)
                    .map((order) => (
                      <tr key={`conta-${order.id}`}>
                        <td><Link href={`/comandas/${order.id}`}>{formatDay(order.day)}</Link></td>
                        <td>{formatReais(order.totalCents)}</td>
                        <td>
                          {order.paidCents > order.totalCents
                            ? `pago a mais ${formatReais(order.paidCents - order.totalCents)}`
                            : `em aberto ${formatReais(order.totalCents - order.paidCents)}`}
                        </td>
                        <td>{order.status === "fechada" ? "fechada" : "aberta"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {ledger && (ledger.sources.length > 0 || ledger.uses.length > 0) ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="desk-bar"><span className="day-label">Crédito</span></div>
              <table>
                <tbody>
                  {ledger.sources.map((row) => (
                    <tr key={`origem-${row.orderId}`}>
                      <td>Entrou</td>
                      <td><Link href={`/comandas/${row.orderId}`}>{formatDay(row.day)}</Link></td>
                      <td>{formatReais(row.cents)}</td>
                    </tr>
                  ))}
                  {ledger.uses.map((row, index) => (
                    <tr key={`uso-${row.orderId}-${index}`}>
                      <td>Usado</td>
                      <td><Link href={`/comandas/${row.orderId}`}>{formatDay(row.day)}</Link></td>
                      <td>{formatReais(row.cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {brief.packages.length > 0 ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="desk-bar"><span className="day-label">Pacotes</span></div>
              <table>
                <tbody>
                  {brief.packages.map((item) => (
                    <tr key={item.id}>
                      <td><Link href={`/pacotes/vendidos/${item.id}`}>{item.name}</Link></td>
                      <td>{item.used} de {item.total}</td>
                      <td>{packageDeadline(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {brief.orders.length > 0 ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="desk-bar"><span className="day-label">Comandas</span></div>
              <table>
                <tbody>
                  {brief.orders.map((order) => (
                    <tr key={order.id}>
                      <td><Link href={`/comandas/${order.id}`}>{formatDay(order.day)}</Link></td>
                      <td>{formatReais(order.totalCents)}</td>
                      <td>
                        {order.paidCents > order.totalCents ? `pago a mais ${formatReais(order.paidCents - order.totalCents)}` : ""}
                        {order.paidCents < order.totalCents ? `em aberto ${formatReais(order.totalCents - order.paidCents)}` : ""}
                      </td>
                      <td>{order.status === "fechada" ? "fechada" : "aberta"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {brief.notes.length > 0 ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="desk-bar"><span className="day-label">Avaliações</span></div>
              <table>
                <tbody>
                  {brief.notes.map((note) => (
                    <tr key={note.id}>
                      <td>{formatDay(note.day)} {note.time}</td>
                      <td>{note.service}</td>
                      <td>{note.author}</td>
                      <td>{note.body}</td>
                      <td>{note.orderId ? <Link href={`/comandas/${note.orderId}`}>Comanda</Link> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
  ) : null;

  return (
    <Panel user={user} current="/clientes" title={person ? person.name : "Novo cliente"}>
      <ErrorNote code={query.erro} />
      {desk ?? editor}
    </Panel>
  );
}
