import { randomUUID } from "crypto";
import type { TransactionSql } from "postgres";
import { FormError } from "@/catalog/errors";
import { db } from "@/db/client";
import { addMinutes, dayParam, freeGaps, fromMinutes, minutes, periodsFor, placementIssue, stamp } from "@/desk/clock";
import { chargedServicePrice } from "@/desk/pricing";
import { stampReferral } from "@/desk/referral";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOrNull(value: string | null | undefined) {
  return value && UUID.test(value) ? value : null;
}

export type BookAppointmentInput = {
  accountId: string;
  actorId: string | null;
  professionalId: string;
  serviceId: string;
  clientId: string;
  day: string;
  start: string;
  encaixe?: boolean;
};

export async function bookAppointment(input: BookAppointmentInput) {
  const day = dayParam(input.day);
  const professionalId = idOrNull(input.professionalId);
  const serviceId = idOrNull(input.serviceId);
  const clientId = idOrNull(input.clientId);
  const start = input.start.slice(0, 5);
  const encaixe = Boolean(input.encaixe);
  if (!professionalId || !serviceId || !clientId) throw new FormError("dados");
  if (!TIME.test(start)) throw new FormError("hora");

  return db().begin(async (tx) => {
    const offer = await tx<{
      durationMin: number;
      priceCents: number;
      commissionPercent: number;
      name: string;
    }[]>`
      SELECT COALESCE(ps.duration_min, s.duration_min) AS "durationMin",
             COALESCE(ps.price_cents, s.price_cents) AS "priceCents",
             COALESCE(ps.commission_percent, s.commission_percent) AS "commissionPercent",
             s.name
      FROM services s
      JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = ${professionalId}
      JOIN professionals p ON p.id = ${professionalId} AND p.account_id = ${input.accountId} AND p.active
      WHERE s.id = ${serviceId} AND s.account_id = ${input.accountId} AND s.active AND s.bookable
    `;
    if (!offer[0]) throw new FormError("dados");
    const end = addMinutes(start, offer[0].durationMin);
    if (minutes(end) >= 24 * 60) throw new FormError("hora");
    const startsAt = stamp(day, start);
    const endsAt = stamp(day, end);

    if (!encaixe) {
      const hours = await tx<{ weekday: number; period: number; startTime: string; endTime: string; validFrom: string | null; validUntil: string | null }[]>`
        SELECT weekday, period, start_time AS "startTime", end_time AS "endTime",
               to_char(valid_from, 'YYYY-MM-DD') AS "validFrom",
               to_char(valid_until, 'YYYY-MM-DD') AS "validUntil"
        FROM professional_hours WHERE professional_id = ${professionalId}
      `;
      const issue = placementIssue(periodsFor(hours, day), start, end);
      if (issue) throw new FormError(issue);
      const clash = await tx`
        SELECT id FROM appointments
        WHERE professional_id = ${professionalId}
          AND status <> 'cancelado'
          AND starts_at < ${endsAt}
          AND ends_at > ${startsAt}
      `;
      if (clash.length) throw new FormError("ocupado");
    }

    const owned = await tx`SELECT id FROM clients WHERE id = ${clientId} AND account_id = ${input.accountId}`;
    if (!owned.length) throw new FormError("cliente");
    const existing = await tx<{ id: string; status: string }[]>`
      SELECT id, status FROM orders
      WHERE account_id = ${input.accountId} AND client_id = ${clientId} AND day = ${day} AND kind = 'cliente'
    `;
    if (existing[0]?.status === "fechada") throw new FormError("fechada");
    const orderId = existing[0]?.id ?? randomUUID();
    if (!existing[0]) {
      await tx`
        INSERT INTO orders (id, account_id, client_id, day, kind, status)
        VALUES (${orderId}, ${input.accountId}, ${clientId}, ${day}, 'cliente', 'aberta')
      `;
    }

    const sheet = offer[0].priceCents;
    const price = await chargedServicePrice(tx, serviceId, day, start, sheet);
    const commission = Math.round((price * offer[0].commissionPercent) / 100);
    const appointmentId = randomUUID();
    const lineId = randomUUID();
    await tx`
      INSERT INTO appointments (
        id, account_id, professional_id, client_id, service_id, order_id,
        starts_at, ends_at, status, encaixe, kind
      ) VALUES (
        ${appointmentId}, ${input.accountId}, ${professionalId}, ${clientId}, ${serviceId}, ${orderId},
        ${startsAt}, ${endsAt}, 'agendado', ${encaixe}, 'horario'
      )
    `;
    await tx`
      INSERT INTO order_lines (
        id, account_id, order_id, appointment_id, kind, service_id, professional_id,
        description, qty, price_cents, list_price_cents, commission_percent, commission_cents
      ) VALUES (
        ${lineId}, ${input.accountId}, ${orderId}, ${appointmentId}, 'servico', ${serviceId}, ${professionalId},
        ${offer[0].name}, 1, ${price}, ${sheet}, ${offer[0].commissionPercent}, ${commission}
      )
    `;
    await stampReferral(tx, input.accountId, orderId, lineId, price);
    return { appointmentId, orderId, day, start, end, serviceName: offer[0].name };
  });
}

export async function cancelAppointment(accountId: string, actorId: string | null, appointmentId: string) {
  const id = idOrNull(appointmentId);
  if (!id) throw new FormError("dados");
  await db().begin(async (tx) => {
    const rows = await tx<{ professionalId: string; orderStatus: string | null; orderId: string | null }[]>`
      SELECT a.professional_id AS "professionalId", o.status AS "orderStatus", a.order_id AS "orderId"
      FROM appointments a
      LEFT JOIN orders o ON o.id = a.order_id
      WHERE a.id = ${id} AND a.account_id = ${accountId} AND a.kind = 'horario' AND a.status <> 'cancelado'
    `;
    if (!rows[0]) throw new FormError("fora");
    if (rows[0].orderStatus === "fechada") throw new FormError("fechada");
    await logCancel(tx, actorId, accountId, id);
    await releaseCredits(tx, accountId, id);
    await tx`UPDATE appointments SET status = 'cancelado' WHERE id = ${id}`;
    await tx`DELETE FROM order_lines WHERE appointment_id = ${id} AND account_id = ${accountId}`;
  });
}

async function logCancel(tx: TransactionSql, actorId: string | null, accountId: string, appointmentId: string) {
  const lines = await tx<{
    id: string;
    orderId: string;
    description: string;
    priceCents: number;
    start: string | null;
    end: string | null;
  }[]>`
    SELECT l.id, l.order_id AS "orderId", l.description, l.price_cents AS "priceCents",
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
           to_char(a.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS "end"
    FROM order_lines l
    JOIN appointments a ON a.id = l.appointment_id
    WHERE l.appointment_id = ${appointmentId} AND l.account_id = ${accountId}
  `;
  const line = lines[0];
  const when = line?.start && line.end ? ` ${line.start}–${line.end}` : "";
  await tx`
    INSERT INTO order_events (
      id, account_id, order_id, line_id, appointment_id, actor_id, kind, summary, before_cents, after_cents
    ) VALUES (
      ${randomUUID()}, ${accountId}, ${line?.orderId ?? null}, ${line?.id ?? null}, ${appointmentId},
      ${actorId}, 'cancelamento', ${line ? `${line.description}${when} cancelado` : "Horário cancelado"},
      ${line?.priceCents ?? null}, null
    )
  `;
}

async function releaseCredits(tx: TransactionSql, accountId: string, appointmentId: string) {
  await tx`
    UPDATE package_credits
    SET status = 'falta_agendar', order_line_id = NULL, appointment_id = NULL, used_on = NULL
    WHERE account_id = ${accountId}
      AND (
        appointment_id = ${appointmentId}
        OR order_line_id IN (SELECT id FROM order_lines WHERE appointment_id = ${appointmentId})
      )
  `;
}

export type OpenSlot = {
  professionalId: string;
  professionalName: string;
  start: string;
  end: string;
};

export async function listOpenSlots(accountId: string, day: string, serviceId: string, professionalId?: string | null) {
  const when = dayParam(day);
  const service = idOrNull(serviceId);
  if (!service) throw new FormError("dados");
  const proFilter = idOrNull(professionalId ?? null);
  const people = await db()<
    { id: string; name: string; durationMin: number }[]
  >`
    SELECT p.id, COALESCE(NULLIF(p.nickname, ''), p.name) AS name,
           COALESCE(ps.duration_min, s.duration_min) AS "durationMin"
    FROM professionals p
    JOIN professional_services ps ON ps.professional_id = p.id
    JOIN services s ON s.id = ps.service_id
    WHERE p.account_id = ${accountId} AND p.active AND s.id = ${service} AND s.active AND s.bookable
      AND (${proFilter}::uuid IS NULL OR p.id = ${proFilter})
    ORDER BY p.name
  `;
  const slots: OpenSlot[] = [];
  for (const person of people) {
    const hours = await db()<
      { weekday: number; period: number; startTime: string; endTime: string; validFrom: string | null; validUntil: string | null }[]
    >`
      SELECT weekday, period, start_time AS "startTime", end_time AS "endTime",
             to_char(valid_from, 'YYYY-MM-DD') AS "validFrom",
             to_char(valid_until, 'YYYY-MM-DD') AS "validUntil"
      FROM professional_hours WHERE professional_id = ${person.id}
    `;
    const periods = periodsFor(hours, when);
    if (!periods.length) continue;
    const busy = await db()<{ start: string; end: string }[]>`
      SELECT to_char(starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
             to_char(ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS "end"
      FROM appointments
      WHERE professional_id = ${person.id}
        AND status <> 'cancelado'
        AND (starts_at AT TIME ZONE 'America/Sao_Paulo')::date = ${when}::date
    `;
    const gaps = freeGaps(periods, busy);
    for (const gap of gaps) {
      let cursor = minutes(gap.start);
      const end = minutes(gap.end);
      while (cursor + person.durationMin <= end) {
        const start = fromMinutes(cursor);
        const finish = fromMinutes(cursor + person.durationMin);
        slots.push({
          professionalId: person.id,
          professionalName: person.name,
          start,
          end: finish,
        });
        cursor += person.durationMin;
      }
    }
  }
  return slots.slice(0, 40);
}

export async function clientUpcomingAppointments(accountId: string, clientId: string) {
  return db()<
    {
      id: string;
      day: string;
      start: string;
      end: string;
      serviceName: string;
      professionalName: string;
      status: string;
    }[]
  >`
    SELECT a.id,
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
           to_char(a.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS "end",
           COALESCE(s.name, 'Horário') AS "serviceName",
           COALESCE(p.name, '—') AS "professionalName",
           a.status
    FROM appointments a
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN professionals p ON p.id = a.professional_id
    WHERE a.account_id = ${accountId}
      AND a.client_id = ${clientId}
      AND a.kind = 'horario'
      AND a.status NOT IN ('cancelado', 'ausente', 'realizado')
      AND a.starts_at >= now() - interval '1 day'
    ORDER BY a.starts_at
    LIMIT 20
  `;
}

export async function clientActivePackages(accountId: string, clientId: string, day: string) {
  const when = dayParam(day);
  return db()<
    {
      id: string;
      name: string;
      used: number;
      total: number;
      validUntil: string | null;
      started: boolean;
    }[]
  >`
    SELECT cp.id, cp.name,
           (SELECT count(*) FROM package_credits cr WHERE cr.client_package_id = cp.id AND cr.status = 'usado')::int AS used,
           (SELECT count(*) FROM package_credits cr WHERE cr.client_package_id = cp.id)::int AS total,
           to_char(cp.valid_until, 'YYYY-MM-DD') AS "validUntil",
           cp.first_used_on IS NOT NULL AS started
    FROM client_packages cp
    WHERE cp.account_id = ${accountId}
      AND cp.client_id = ${clientId}
      AND cp.status = 'ativo'
      AND (cp.valid_until IS NULL OR cp.valid_until >= ${when}::date)
    ORDER BY cp.valid_until NULLS LAST, cp.name
  `;
}
