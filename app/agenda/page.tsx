import Link from "next/link";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatPhone, formatReais } from "@/catalog/format";
import { birthdaysOn } from "@/catalog/queries";
import { blockSlot, openConsumption, openDuePackageVisits } from "@/desk/actions";
import { WEEKDAYS } from "@/catalog/labels";
import { dayParam, freeGaps, fromMinutes, minutes, periodsFor, shiftDay, weekBounds, weekdayOf } from "@/desk/clock";
import {
  clientOptions,
  dayAppointments,
  dayCancellations,
  dayHours,
  dayRoster,
  linkedProfessional,
  serviceOptions,
  weekSlotCounts,
} from "@/desk/queries";
import { APPOINTMENT_STATUS, blockPaint, CLOSED, FIT_IN, LUNCH, OUTSIDE } from "@/desk/statuses";
import { AgendaDesk } from "@/ui/agenda-desk";
import { BookForm } from "@/ui/book-form";
import { ErrorNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const HOUR = 96;

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; erro?: string; cliente?: string; servico?: string; profissional?: string; inicio?: string }>;
}) {
  const user = await requireDesk();
  const query = await searchParams;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const bookClient = query.cliente && uuid.test(query.cliente) ? query.cliente : "";
  const bookService = query.servico && uuid.test(query.servico) ? query.servico : "";
  const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/;
  const bookProfessional = query.profissional && uuid.test(query.profissional) ? query.profissional : "";
  const bookStart = query.inicio && timeOk.test(query.inicio) ? query.inicio : "";
  const day = dayParam(query.dia);
  await openDuePackageVisits(user.accountId, user.id, day);
  const operator = user.role === "administrador" || user.role === "balcao";
  const own = user.role === "profissional" ? await linkedProfessional(user.id) : null;
  const roster = own || user.role !== "profissional" ? await dayRoster(user.accountId, own) : [];
  const hours = await dayHours(user.accountId);
  const week = weekBounds(day);
  const [appointments, weekCounts] = await Promise.all([
    dayAppointments(user.accountId, day),
    weekSlotCounts(user.accountId, week.start, week.end, own),
  ]);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDay(week.start, index);
    return {
      day: date,
      label: WEEKDAYS[weekdayOf(date)]?.slice(0, 3) ?? date,
      qty: weekCounts.find((row) => row.day === date)?.qty ?? 0,
    };
  });
  const birthdays = await birthdaysOn(user.accountId, day);
  const birthdayClients = new Set(birthdays.clients.map((person) => person.id));
  const birthdayPros = new Set(birthdays.professionals.map((person) => person.id));
  const cancellations = await dayCancellations(user.accountId, day, own);
  const people = await clientOptions(user.accountId);
  const rawServices = await serviceOptions(user.accountId);
  const services = [...rawServices.reduce((map, row) => {
    const current = map.get(row.id) ?? { id: row.id, name: row.name, professionalIds: [] as string[] };
    current.professionalIds.push(row.professionalId);
    map.set(row.id, current);
    return map;
  }, new Map<string, { id: string; name: string; professionalIds: string[] }>()).values()];

  const bookable = roster.filter((person) => person.bookable || appointments.some((item) => item.professionalId === person.id));
  let startMin = 8 * 60;
  let endMin = 21 * 60;
  for (const person of bookable) {
    for (const period of periodsFor(hours.filter((row) => row.professionalId === person.id), day)) {
      startMin = Math.min(startMin, minutes(period.start));
      endMin = Math.max(endMin, minutes(period.end));
    }
  }
  for (const item of appointments) {
    startMin = Math.min(startMin, minutes(item.start));
    endMin = Math.max(endMin, minutes(item.end));
  }
  startMin = Math.floor(startMin / 60) * 60;
  endMin = Math.ceil(endMin / 60) * 60;
  if (endMin <= startMin) endMin = startMin + 60;
  const height = ((endMin - startMin) / 60) * HOUR;
  const marks: number[] = [];
  for (let mark = startMin; mark <= endMin; mark += 60) marks.push(mark);

  const legend = [...Object.values(APPOINTMENT_STATUS), LUNCH, CLOSED, FIT_IN, OUTSIDE];
  const visible = appointments.filter((item) => bookable.some((person) => person.id === item.professionalId));
  const gaps = bookable.flatMap((person) => {
    const periods = periodsFor(hours.filter((row) => row.professionalId === person.id), day);
    const busy = visible
      .filter((item) => item.professionalId === person.id && item.status !== "cancelado")
      .map((item) => ({ start: item.start, end: item.end }));
    return freeGaps(periods, busy).map((gap) => ({
      professionalId: person.id,
      name: person.nickname || person.name,
      start: gap.start,
      end: gap.end,
    }));
  });
  const onFloor = visible
    .filter((item) => item.kind === "horario" && (item.status === "chegou" || item.status === "em_atendimento"))
    .sort((a, b) => a.start.localeCompare(b.start));

  return (
    <Panel user={user} current="/agenda" title="Agenda">
      <div className="desk">
        <div className="desk-bar">
          <Link className="btn quiet" href={`/agenda?dia=${shiftDay(day, -1)}`}>
            ←
          </Link>
          <span className="day-label">{formatDay(day)}</span>
          <Link className="btn quiet" href={`/agenda?dia=${shiftDay(day, 1)}`}>
            →
          </Link>
          <Link className="btn quiet" href="/agenda">
            Hoje
          </Link>
          <Link className="btn quiet" href={`/agenda?dia=${shiftDay(week.start, -7)}`}>
            Sem. ant.
          </Link>
          <Link className="btn quiet" href={`/agenda?dia=${shiftDay(week.start, 7)}`}>
            Próx. sem.
          </Link>
          {bookable.length > 0 ? (
            <Modal label="Novo horário" title="Novo horário" tone="blue" startOpen={Boolean((bookClient && bookService) || (bookProfessional && bookStart))}>
              <BookForm
                day={day}
                lockedProfessional={own}
                initialProfessional={bookProfessional || undefined}
                initialClient={bookClient}
                initialService={bookService}
                initialStart={bookStart || "09:00"}
                professionals={bookable.map((person) => ({ id: person.id, name: person.nickname || person.name }))}
                services={services}
                clients={people.map((person) => ({ id: person.id, name: person.name }))}
              />
            </Modal>
          ) : null}
          {bookable.length > 0 ? (
            <Modal label="Bloquear" title="Bloquear horário" tone="navy">
              <form action={blockSlot}>
                <input type="hidden" name="day" value={day} />
                {own ? <input type="hidden" name="professional" value={own} /> : (
                  <label>
                    Profissional
                    <select name="professional" required defaultValue={bookable[0]?.id}>
                      {bookable.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.nickname || person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="split">
                  <label>
                    Início
                    <input name="start" type="time" required defaultValue="12:00" />
                  </label>
                  <label>
                    Fim
                    <input name="end" type="time" required defaultValue="13:00" />
                  </label>
                </div>
                <SubmitButton label="Bloquear" pendingLabel="Bloqueando…" />
              </form>
            </Modal>
          ) : null}
          {roster.length > 0 ? (
            <Modal label="Consumo" title="Comanda de consumo" tone="teal">
              <form action={openConsumption}>
                <input type="hidden" name="day" value={day} />
                {own ? <input type="hidden" name="professional" value={own} /> : (
                  <label>
                    Profissional
                    <select name="professional" required defaultValue={roster[0]?.id}>
                      {roster.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p>Uma por profissional neste dia. Não entra na grade e fecha sem dinheiro.</p>
                <SubmitButton label="Abrir consumo" pendingLabel="Abrindo…" className="teal" />
              </form>
            </Modal>
          ) : null}
          <Link className="btn quiet" href={`/espera?dia=${day}`}>
            Espera
          </Link>
          <Link className="btn quiet" href={`/lembretes?dia=${day}`}>
            Lembretes
          </Link>
        </div>

        <div className="desk-bar week-strip">
          {weekDays.map((item) => (
            <Link
              key={item.day}
              className={item.day === day ? "btn" : "btn quiet"}
              href={`/agenda?dia=${item.day}`}
            >
              {item.label} {item.day.slice(8, 10)}
              {item.qty > 0 ? ` · ${item.qty}` : ""}
            </Link>
          ))}
        </div>

        <ErrorNote code={query.erro} />

        {user.role === "profissional" && !own ? (
          <p className="desk-alert">Este acesso ainda não está ligado a um profissional.</p>
        ) : null}
        {bookable.length === 0 && user.role !== "profissional" ? (
          <p className="desk-alert">Cadastre um profissional que atende para abrir a grade.</p>
        ) : null}

        {bookable.length > 0 ? (
          <>
            {onFloor.length > 0 ? (
              <div className="desk-floor">
                <span className="label">Na casa</span>
                {onFloor.map((item) => {
                  const who = bookable.find((person) => person.id === item.professionalId);
                  const label = [
                    item.status === "chegou" ? "Chegou" : "Em atendimento",
                    item.start,
                    item.clientName ?? "Sem nome",
                    who ? who.nickname || who.name : "",
                    item.waitMin != null
                      ? item.status === "chegou"
                        ? `há ${item.waitMin} min`
                        : `esperou ${item.waitMin} min`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" · ");
                  return item.orderId ? (
                    <Link key={item.id} className="chip ok" href={`/comandas/${item.orderId}`}>
                      {label}
                    </Link>
                  ) : (
                    <span key={item.id} className="chip ok">
                      {label}
                    </span>
                  );
                })}
              </div>
            ) : null}

            <AgendaDesk
              day={day}
              startMin={startMin}
              hourPx={HOUR}
              lockedProfessional={own}
              operator={operator}
              professionals={bookable.map((person) => ({ id: person.id, name: person.nickname || person.name }))}
              services={services}
              clients={people.map((person) => ({ id: person.id, name: person.name }))}
            >
              <div className="board">
                <div className="board-hours" style={{ height }}>
                  {marks.map((mark) => (
                    <span key={mark} style={{ top: ((mark - startMin) / 60) * HOUR }}>
                      {fromMinutes(mark)}
                    </span>
                  ))}
                </div>
                {bookable.map((person) => {
                  const periods = periodsFor(hours.filter((row) => row.professionalId === person.id), day);
                  const spans = periods
                    .map((period) => ({ start: minutes(period.start), end: minutes(period.end) }))
                    .sort((a, b) => a.start - b.start);
                  const shades: { start: number; end: number; lunch: boolean }[] = [];
                  if (spans.length === 0) shades.push({ start: startMin, end: endMin, lunch: false });
                  let cursor = startMin;
                  spans.forEach((span, index) => {
                    if (span.start > cursor) shades.push({ start: cursor, end: span.start, lunch: index > 0 });
                    cursor = Math.max(cursor, span.end);
                  });
                  if (spans.length > 0 && cursor < endMin) shades.push({ start: cursor, end: endMin, lunch: false });
                  const columnItems = appointments.filter((item) => item.professionalId === person.id);
                  return (
                    <section className="board-col" key={person.id}>
                      <header style={{ borderTopColor: person.columnColor }}>
                        <strong>
                          {person.nickname || person.name}
                          {birthdayPros.has(person.id) ? " · aniversário" : ""}
                        </strong>
                      </header>
                      <div className="board-grid" data-pro={person.id} style={{ height }}>
                        {marks.map((mark) => (
                          <i key={mark} style={{ top: ((mark - startMin) / 60) * HOUR }} />
                        ))}
                        {shades.map((shade) => {
                          const paint = shade.lunch ? LUNCH : CLOSED;
                          return (
                            <div
                              key={`${shade.start}-${shade.lunch}`}
                              className="shade"
                              style={{
                                top: ((shade.start - startMin) / 60) * HOUR,
                                height: ((shade.end - shade.start) / 60) * HOUR,
                                background: paint.bg,
                                color: paint.fg,
                              }}
                            >
                              {paint.word}
                            </div>
                          );
                        })}
                        {columnItems.map((item) => {
                          const paint = blockPaint(item);
                          const moved = item.status === "chegou" || item.status === "em_atendimento" || item.status === "realizado";
                          const birthday = item.clientId && birthdayClients.has(item.clientId) ? " · aniversário" : "";
                          const name = item.kind === "bloqueio" ? "Bloqueado" : `${item.clientName ?? "Sem nome"}${birthday}`;
                          const marks = [item.status === "cancelado" ? "Cancelado" : "", item.encaixe ? "Encaixe" : ""].filter(Boolean);
                          const title = marks.length ? `${marks.join(" · ")} · ${name}` : name;
                          const phone = item.phone ? formatPhone(item.phone) : "";
                          const when = `${item.start}–${item.end}`;
                          const extra = moved && item.fromOutside ? "De fora" : "";
                          const style = {
                            top: ((minutes(item.start) - startMin) / 60) * HOUR,
                            height: ((minutes(item.end) - minutes(item.start)) / 60) * HOUR,
                            background: paint.bg,
                            color: paint.fg,
                          };
                          return (
                            <div
                              key={item.id}
                              className={item.encaixe ? "slot fit" : "slot"}
                              data-slot={item.id}
                              data-kind={item.kind}
                              data-status={item.status}
                              data-encaixe={item.encaixe ? "1" : "0"}
                              data-order={item.orderId ?? ""}
                              data-order-status={item.orderStatus ?? ""}
                              data-name={title}
                              data-phone={phone}
                              data-service={item.serviceName ?? ""}
                              data-when={when}
                              data-word={item.kind === "horario" ? paint.word : "Bloqueado"}
                              data-extra={extra}
                              style={style}
                            >
                              <strong>{title}</strong>
                              <span className="slot-meta">
                                {[phone, when, item.waitMin == null ? "" : item.status === "chegou" ? `há ${item.waitMin} min` : `esperou ${item.waitMin} min`].filter(Boolean).join(" · ")}
                              </span>
                              {item.serviceName ? <span className="slot-service">{item.serviceName}</span> : null}
                              {item.status === "cancelado" ? null : <span className="resize" data-resize="1" />}
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </AgendaDesk>

            {gaps.length > 0 ? (
              <div className="desk-floor">
                <span className="label">Livres</span>
                {gaps.map((gap) => {
                  const params = new URLSearchParams({ dia: day, profissional: gap.professionalId, inicio: gap.start });
                  if (bookClient) params.set("cliente", bookClient);
                  if (bookService) params.set("servico", bookService);
                  return (
                    <Link key={`${gap.professionalId}-${gap.start}`} className="btn quiet" href={`/agenda?${params.toString()}`}>
                      {gap.name} {gap.start}–{gap.end}
                    </Link>
                  );
                })}
              </div>
            ) : null}

            <details className="desk-secondary">
              <summary>Legenda</summary>
              <ul className="legend">
                {legend.map((item) => (
                  <li key={item.word} style={{ background: item.bg, color: item.fg }}>
                    {item.word}
                  </li>
                ))}
              </ul>
            </details>
          </>
        ) : null}

        {cancellations.length > 0 ? (
          <div className="desk-secondary">
            <details>
              <summary>Cancelados do dia ({cancellations.length})</summary>
              <div className="card">
                <table>
                  <thead>
                    <tr>
                      <th>Horário</th>
                      <th>Cliente</th>
                      <th>Profissional</th>
                      <th>Serviço</th>
                      <th>Valor</th>
                      <th>Quem</th>
                      <th>Quando</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {cancellations.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.start}–{item.end}
                        </td>
                        <td>
                          {item.clientName ?? "Sem nome"}
                          {item.clientId && birthdayClients.has(item.clientId) ? " · aniversário" : ""}
                        </td>
                        <td>{item.professionalName ?? "—"}</td>
                        <td>{item.serviceName ?? "—"}</td>
                        <td>{item.priceCents == null ? "—" : formatReais(item.priceCents)}</td>
                        <td>{item.actorName ?? "—"}</td>
                        <td>{item.at ?? "—"}</td>
                        <td>
                          {item.orderId ? (
                            <Link className="btn quiet" href={`/comandas/${item.orderId}`}>
                              Comanda
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
