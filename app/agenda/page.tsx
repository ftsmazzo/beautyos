import Link from "next/link";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatPhone } from "@/catalog/format";
import { blockSlot, openConsumption } from "@/desk/actions";
import { dayParam, fromMinutes, minutes, periodsFor, shiftDay } from "@/desk/clock";
import {
  clientOptions,
  dayAppointments,
  dayHours,
  dayRoster,
  linkedProfessional,
  serviceOptions,
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
  searchParams: Promise<{ dia?: string; erro?: string }>;
}) {
  const user = await requireDesk();
  const query = await searchParams;
  const day = dayParam(query.dia);
  const own = user.role === "profissional" ? await linkedProfessional(user.id) : null;
  const roster = own || user.role !== "profissional" ? await dayRoster(user.accountId, own) : [];
  const hours = await dayHours(user.accountId);
  const appointments = await dayAppointments(user.accountId, day);
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

  const legend = [
    ...Object.values(APPOINTMENT_STATUS).filter((item) => item.word !== "Cancelado"),
    LUNCH,
    CLOSED,
    FIT_IN,
    OUTSIDE,
  ];

  return (
    <Panel user={user} current="/agenda" title="Agenda">
      <div className="row">
        <Link className="btn quiet" href={`/agenda?dia=${shiftDay(day, -1)}`}>
          Dia anterior
        </Link>
        <strong>{formatDay(day)}</strong>
        <Link className="btn quiet" href={`/agenda?dia=${shiftDay(day, 1)}`}>
          Próximo dia
        </Link>
        <Link className="btn quiet" href="/agenda">
          Hoje
        </Link>
        {bookable.length > 0 ? (
          <Modal label="Novo horário" title="Novo horário" tone="blue">
            <BookForm
              day={day}
              lockedProfessional={own}
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
      </div>
      <ErrorNote code={query.erro} />
      {user.role === "profissional" && !own ? (
        <div className="card">
          <p>Este acesso ainda não está ligado a um profissional.</p>
        </div>
      ) : null}
      {bookable.length === 0 && user.role !== "profissional" ? (
        <div className="card">
          <p>Cadastre um profissional que atende para abrir a grade.</p>
        </div>
      ) : null}
      {bookable.length > 0 ? (
        <>
          <ul className="legend">
            {legend.map((item) => (
              <li key={item.word} style={{ background: item.bg, color: item.fg }}>
                {item.word}
              </li>
            ))}
          </ul>
          <p>Passe o mouse no horário para ver nome, telefone, serviço e status. Clique esquerdo ou direito abre o menu. Arraste o horário para mudar a hora ou a coluna. Arraste a borda de baixo para estender.</p>
          <AgendaDesk
            day={day}
            startMin={startMin}
            hourPx={HOUR}
            lockedProfessional={own}
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
                    <strong>{person.nickname || person.name}</strong>
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
                      const name = item.kind === "bloqueio" ? "Bloqueado" : item.clientName ?? "Sem nome";
                      const phone = item.phone ? formatPhone(item.phone) : "";
                      const when = `${item.start}–${item.end}`;
                      const extra = [moved && item.encaixe ? "Encaixe" : "", moved && item.fromOutside ? "De fora" : ""].filter(Boolean).join(" · ");
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
                          data-name={name}
                          data-phone={phone}
                          data-service={item.serviceName ?? ""}
                          data-when={when}
                          data-word={item.kind === "horario" ? paint.word : "Bloqueado"}
                          data-extra={extra}
                          style={style}
                        >
                          <strong>{name}</strong>
                          <span className="slot-meta">{[phone, when].filter(Boolean).join(" · ")}</span>
                          {item.serviceName ? <span className="slot-service">{item.serviceName}</span> : null}
                          <span className="resize" data-resize="1" />
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
          </AgendaDesk>
        </>
      ) : null}
    </Panel>
  );
}
