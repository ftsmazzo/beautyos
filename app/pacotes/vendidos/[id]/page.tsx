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
          {item.name} · {item.used} de {item.total} usadas
        </p>
        <p>
          Pago {formatReais(item.paidCents)}
          {methods ? ` · ${methods}` : ""}
          {item.paidCents !== item.priceCents ? ` · pacote ${formatReais(item.priceCents)}` : ""}
          {item.paidCents < item.priceCents ? ` · falta ${formatReais(item.priceCents - item.paidCents)}` : ""}
        </p>
        {item.paidCents < item.priceCents && item.orderId ? (
          <p>
            Receber continua na{" "}
            <Link href={`/comandas/${item.orderId}`}>comanda da venda</Link>
            .
          </p>
        ) : null}
        <p>
          {deadline}
          {item.pardons > 0 ? " · já houve perdão" : ""}
          {item.nextVisit ? ` · próxima ${item.nextVisit}` : ""}
        </p>
        {item.status === "cancelado" ? <p>Cancelado.{item.cancelReason ? ` ${item.cancelReason}` : ""}</p> : null}
        {item.status === "encerrado" ? <p>Encerrado após cobrar a diferença.</p> : null}
        {warned ? (
          <>
            <p className="warn">
              Pacote vencido.
              {item.pardons > 0 ? ` Já houve perdão. Esta é a ${item.pardons + 1}ª vez.` : ""}
            </p>
            <p>Perdoar renova o prazo e alcança a última ida já marcada. Cobrar a diferença põe o avulso na comanda daquela ida e encerra o pacote.</p>
            <form action={pardonPackage}>
              <input type="hidden" name="package" value={item.id} />
              <SubmitButton label="Perdoar" pendingLabel="Perdoando…" className="quiet" />
            </form>
          </>
        ) : null}
      </div>
      <div className="card">
        <h2>Idas</h2>
        {item.status === "ativo" ? <p>Falta agendar entra na comanda de hoje ou ganha um horário. Ida marcada pode mudar de dia. Ida depois do prazo cobra a diferença ou espera o perdão.</p> : null}
        {visits.length === 0 ? <p>Nenhuma ida neste pacote.</p> : null}
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
                      {open && people.length === 0 ? <p>Nenhum profissional faz este serviço.</p> : null}
                      {open && people.length > 0 && visit.status === "falta_agendar" && !item.expired && !item.late ? (
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
      {item.status === "ativo" ? (
        <form action={cancelPackageSale}>
          <input type="hidden" name="package" value={item.id} />
          <h2>Cancelar venda</h2>
          <p>O que já foi usado permanece. O que não foi usado sai. Se o valor já entrou no caixa, o estorno sai hoje.</p>
          <label>
            Motivo
            <textarea name="reason" required minLength={3} maxLength={300} />
          </label>
          <SubmitButton label="Cancelar venda" pendingLabel="Cancelando…" className="rose" />
        </form>
      ) : null}
    </Panel>
  );
}
