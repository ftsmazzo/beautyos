import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, formatReais, packageDeadline, todaySaoPaulo } from "@/catalog/format";
import { movePackageVisit, schedulePackageVisit, usePackageVisitNow } from "@/desk/actions";
import { dayRoster, serviceOptions, soldPackage, soldPackageVisits } from "@/desk/queries";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function SoldPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOperator();
  const { id } = await params;
  const today = todaySaoPaulo();
  const item = await soldPackage(user.accountId, id, today);
  if (!item) redirect("/pacotes/vendidos");
  const visits = await soldPackageVisits(user.accountId, id);
  const editable = item.status === "ativo" && visits.some((visit) => visit.status === "falta_agendar" || visit.status === "agendado");
  const roster = editable ? await dayRoster(user.accountId, null) : [];
  const catalog = editable ? await serviceOptions(user.accountId) : [];
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

  return (
    <Panel user={user} current="/pacotes/vendidos" title="Pacote vendido">
      <div className="row">
        <Link className="btn quiet" href="/pacotes/vendidos">
          Pacotes vendidos
        </Link>
        {item.orderId ? (
          <Link className="btn quiet" href={`/comandas/${item.orderId}`}>
            Comanda da venda
          </Link>
        ) : null}
      </div>
      <div className="card">
        <strong>{item.clientName}</strong>
        {item.phone ? <p>{formatPhone(item.phone)}</p> : null}
        <p>
          {item.name} · {item.used} de {item.total} usadas · {formatReais(item.priceCents)}
        </p>
        <p>
          {deadline}
          {item.pardons > 0 ? " · já houve perdão" : ""}
          {item.nextVisit ? ` · próxima ${item.nextVisit}` : ""}
        </p>
      </div>
      <div className="card">
        <h2>Idas</h2>
        {item.status === "ativo" ? <p>Falta agendar entra na comanda de hoje ou ganha um horário. Ida marcada pode mudar de dia.</p> : null}
        {visits.length === 0 ? <p>Nenhuma ida neste pacote.</p> : null}
        {visits.length > 0 ? (
          <table>
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
                return (
                  <tr key={visit.id}>
                    <td>{visit.serviceName}</td>
                    <td>
                      {visit.status === "usado" ? "Usada" : visit.when ?? "Falta agendar"}
                      {visit.late ? " · depois do prazo" : ""}
                    </td>
                    <td>{visit.professionalName ?? "—"}</td>
                    <td>
                      {visit.orderId ? <Link href={`/comandas/${visit.orderId}`}>Abrir</Link> : null}
                      {open && people.length === 0 ? <p>Nenhum profissional faz este serviço.</p> : null}
                      {open && people.length > 0 && visit.status === "falta_agendar" && !item.expired ? (
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
                          <SubmitButton label="Usar agora" pendingLabel="Usando…" className="quiet" />
                        </form>
                      ) : null}
                      {open && people.length > 0 && visit.status === "falta_agendar" ? (
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
                          <SubmitButton label="Marcar" pendingLabel="Marcando…" className="quiet" />
                        </form>
                      ) : null}
                      {open && people.length > 0 && visit.status === "agendado" ? (
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
                          <SubmitButton label="Remarcar" pendingLabel="Remarcando…" className="quiet" />
                        </form>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
