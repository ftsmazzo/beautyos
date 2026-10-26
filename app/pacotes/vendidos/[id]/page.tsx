import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, formatReais, packageDeadline, todaySaoPaulo } from "@/catalog/format";
import {
  cancelPackageSale,
  chargePackageDifference,
  movePackageVisit,
  pardonPackage,
  schedulePackageVisit,
  usePackageVisitNow,
} from "@/desk/actions";
import { dayRoster, serviceOptions, soldPackage, soldPackageVisits } from "@/desk/queries";
import { paymentMethodsLabel } from "@/desk/statuses";
import { ErrorNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function SoldPackagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireOperator();
  const { id } = await params;
  const query = await searchParams;
  const today = todaySaoPaulo();
  const item = await soldPackage(user.accountId, id, today);
  if (!item) redirect("/pacotes/vendidos");
  const visits = await soldPackageVisits(user.accountId, id);
  const warned = item.status === "ativo" && (item.expired || item.late);
  const editable = item.status === "ativo" && visits.some((visit) => visit.status === "falta_agendar" || visit.status === "agendado");
  const roster = editable || warned ? await dayRoster(user.accountId, null) : [];
  const catalog = editable || warned ? await serviceOptions(user.accountId) : [];
  const now = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date()).slice(0, 5);
  const deadline = packageDeadline({
    started: item.started,
    validUntil: item.validUntil ? formatDay(item.validUntil) : null,
    expired: item.expired,
    late: item.late,
  });
  const methods = paymentMethodsLabel(item.payMethods);

  return (
    <Panel user={user} current="/pacotes/vendidos" title="Pacote vendido">
      <ErrorNote code={query.erro} />
      <div className="desk">
      <div className="desk-bar">
        <Link className="btn quiet" href="/pacotes/vendidos">
          Vendidos
        </Link>
        <span className="day-label">{item.clientName}</span>
        {item.phone ? <span className="chip">{formatPhone(item.phone)}</span> : null}
        <span className="chip">{item.name} · {item.used}/{item.total}</span>
        <span className="chip">
          Pago {formatReais(item.paidCents)}
          {methods ? ` · ${methods}` : ""}
          {item.paidCents < item.priceCents ? ` · falta ${formatReais(item.priceCents - item.paidCents)}` : ""}
        </span>
        <span className="chip">
          {deadline}
          {item.pardons > 0 ? " · perdão" : ""}
          {item.nextVisit ? ` · ${item.nextVisit}` : ""}
        </span>
        {item.orderId ? (
          <Link className="btn quiet" href={`/comandas/${item.orderId}`}>
            Comanda
          </Link>
        ) : null}
        {item.status === "ativo" ? (
          <Modal label="Cancelar venda" title="Cancelar venda" tone="rose">
            <form action={cancelPackageSale}>
              <input type="hidden" name="package" value={item.id} />
              <label>
                Motivo
                <textarea name="reason" required minLength={3} maxLength={300} />
              </label>
              <SubmitButton label="Cancelar venda" pendingLabel="Cancelando…" className="rose" />
            </form>
          </Modal>
        ) : null}
        {item.status === "cancelado" ? <span className="chip">{item.cancelReason || "Cancelado"}</span> : null}
        {item.status === "encerrado" ? <span className="chip">Encerrado</span> : null}
        {warned ? (
          <form action={pardonPackage}>
            <input type="hidden" name="package" value={item.id} />
            <SubmitButton
              label={item.pardons > 0 ? `Perdoar · ${item.pardons + 1}ª` : "Perdoar"}
              pendingLabel="Perdoando…"
              className="quiet"
            />
          </form>
        ) : null}
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        {visits.length === 0 ? <p className="queue-empty">Nenhuma ida neste pacote.</p> : null}
        {visits.length > 0 ? (
          <table className="sheet">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Quando</th>
                <th>Profissional</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => {
                const people = roster.filter((person) => catalog.some((service) => service.id === visit.serviceId && service.professionalId === person.id));
                const open = item.status === "ativo" && (visit.status === "falta_agendar" || visit.status === "agendado");
                const due = visit.late ? Math.max(0, visit.listPriceCents - visit.internalPriceCents) : null;
                return (
                  <tr key={visit.id}>
                    <td data-label="Serviço">{visit.serviceName}</td>
                    <td data-label="Quando">
                      {visit.status === "usado" ? "Usada" : visit.when ?? "Falta agendar"}
                      {visit.late ? " · depois do prazo" : ""}
                      {due != null ? ` · diferença ${formatReais(due)}` : ""}
                    </td>
                    <td data-label="Profissional">{visit.professionalName ?? "—"}</td>
                    <td data-label="Ações">
                      {visit.orderId ? <Link href={`/comandas/${visit.orderId}`}>Abrir</Link> : null}
                      {item.status === "ativo" && visit.late ? (
                        <form action={chargePackageDifference}>
                          <input type="hidden" name="package" value={item.id} />
                          <input type="hidden" name="credit" value={visit.id} />
                          <SubmitButton
                            label={`Cobrar diferença ${formatReais(due ?? 0)}`}
                            pendingLabel="Cobrando…"
                            className="quiet"
                          />
                        </form>
                      ) : null}
                      {open && people.length === 0 ? <span className="chip">Sem profissional</span> : null}
                      {open && people.length > 0 && visit.status === "falta_agendar" ? (
                        <Modal label="Marcar" title={`Marcar · ${visit.serviceName}`} tone="blue">
                          {!item.expired && !item.late ? (
                            <form action={usePackageVisitNow}>
                              <input type="hidden" name="package" value={item.id} />
                              <input type="hidden" name="credit" value={visit.id} />
                              <label>
                                Profissional
                                <select name="professional" required defaultValue={people[0]?.id}>
                                  {people.map((person) => (
                                    <option key={person.id} value={person.id}>{person.nickname || person.name}</option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                Horário
                                <input type="time" name="start" required defaultValue={now} />
                              </label>
                              <SubmitButton label="Usar agora" pendingLabel="Usando…" />
                            </form>
                          ) : null}
                          <form action={schedulePackageVisit}>
                            <input type="hidden" name="package" value={item.id} />
                            <input type="hidden" name="order" value={item.orderId ?? ""} />
                            <input type="hidden" name="credit" value={visit.id} />
                            <label>
                              Profissional
                              <select name="professional" required defaultValue={people[0]?.id}>
                                {people.map((person) => (
                                  <option key={person.id} value={person.id}>{person.nickname || person.name}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Dia
                              <input type="date" name="day" required defaultValue={today} />
                            </label>
                            <label>
                              Horário
                              <input type="time" name="start" required defaultValue="09:00" />
                            </label>
                            <SubmitButton label="Marcar" pendingLabel="Marcando…" />
                          </form>
                        </Modal>
                      ) : null}
                      {open && people.length > 0 && visit.status === "agendado" ? (
                        <Modal label="Remarcar" title={`Remarcar · ${visit.serviceName}`} tone="navy">
                          <form action={movePackageVisit}>
                            <input type="hidden" name="package" value={item.id} />
                            <input type="hidden" name="credit" value={visit.id} />
                            <label>
                              Profissional
                              <select name="professional" required defaultValue={visit.professionalId ?? people[0]?.id}>
                                {people.map((person) => (
                                  <option key={person.id} value={person.id}>{person.nickname || person.name}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Dia
                              <input type="date" name="day" required defaultValue={visit.day ?? today} />
                            </label>
                            <label>
                              Horário
                              <input type="time" name="start" required defaultValue={visit.start ?? "09:00"} />
                            </label>
                            <SubmitButton label="Remarcar" pendingLabel="Remarcando…" />
                          </form>
                        </Modal>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
      </div>
    </Panel>
  );
}
