import { db } from "@/db/client";
import { stamp } from "@/desk/clock";

export async function linkedProfessional(userId: string) {
  const rows = await db()<{ id: string }[]>`
    SELECT id FROM professionals WHERE user_id = ${userId} LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

export async function dayRoster(accountId: string, onlyProfessionalId: string | null) {
  return db()<{
    id: string;
    name: string;
    nickname: string | null;
    columnColor: string;
    bookable: boolean;
  }[]>`
    SELECT id, name, nickname, column_color AS "columnColor", bookable
    FROM professionals
    WHERE account_id = ${accountId}
      AND active
      AND (${onlyProfessionalId}::uuid IS NULL OR id = ${onlyProfessionalId})
    ORDER BY name
  `;
}

export async function dayHours(accountId: string) {
  return db()<{
    professionalId: string;
    weekday: number;
    period: number;
    startTime: string;
    endTime: string;
    validFrom: string | null;
    validUntil: string | null;
  }[]>`
    SELECT h.professional_id AS "professionalId", h.weekday, h.period,
           h.start_time AS "startTime", h.end_time AS "endTime",
           to_char(h.valid_from, 'YYYY-MM-DD') AS "validFrom",
           to_char(h.valid_until, 'YYYY-MM-DD') AS "validUntil"
    FROM professional_hours h
    JOIN professionals p ON p.id = h.professional_id
    WHERE p.account_id = ${accountId}
  `;
}

export async function dayAppointments(accountId: string, day: string) {
  const start = stamp(day, "00:00");
  const end = stamp(day, "23:59");
  return db()<{
    id: string;
    professionalId: string;
    clientId: string | null;
    clientName: string | null;
    phone: string | null;
    fromOutside: boolean;
    serviceName: string | null;
    orderId: string | null;
    start: string;
    end: string;
    status: string;
    encaixe: boolean;
    kind: string;
  }[]>`
    SELECT a.id, a.professional_id AS "professionalId", a.client_id AS "clientId",
           c.name AS "clientName", c.phone, COALESCE(c.from_outside, false) AS "fromOutside",
           s.name AS "serviceName", a.order_id AS "orderId",
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
           to_char(a.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS "end",
           a.status, a.encaixe, a.kind
    FROM appointments a
    LEFT JOIN clients c ON c.id = a.client_id
    LEFT JOIN services s ON s.id = a.service_id
    WHERE a.account_id = ${accountId}
      AND a.starts_at < ${end}
      AND a.ends_at > ${start}
    ORDER BY a.starts_at
  `;
}

export async function clientOptions(accountId: string) {
  return db()<{ id: string; name: string; phone: string; fromOutside: boolean }[]>`
    SELECT id, name, phone, from_outside AS "fromOutside"
    FROM clients
    WHERE account_id = ${accountId} AND active
    ORDER BY name
  `;
}

export async function serviceOptions(accountId: string) {
  return db()<{ id: string; name: string; professionalId: string }[]>`
    SELECT s.id, s.name, ps.professional_id AS "professionalId"
    FROM services s
    JOIN professional_services ps ON ps.service_id = s.id
    WHERE s.account_id = ${accountId} AND s.active AND s.bookable
    ORDER BY s.name
  `;
}

export async function consumptionProducts(accountId: string) {
  return db()<{ id: string; name: string }[]>`
    SELECT id, name
    FROM products
    WHERE account_id = ${accountId} AND active
    ORDER BY name
  `;
}

export async function productOptions(accountId: string) {
  return db()<{ id: string; name: string; priceCents: number }[]>`
    SELECT id, name, sale_price_cents AS "priceCents"
    FROM products
    WHERE account_id = ${accountId} AND active AND sells_to_client
    ORDER BY name
  `;
}

export async function dayOrders(accountId: string, day: string, professionalId: string | null) {
  return db()<{
    id: string;
    clientName: string | null;
    phone: string | null;
    kind: string;
    status: string;
    incomplete: boolean;
    professionalName: string | null;
    totalCents: number;
    paidCents: number;
  }[]>`
    SELECT o.id, c.name AS "clientName", c.phone, o.kind, o.status, o.incomplete,
           p.name AS "professionalName",
           COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)::int AS "totalCents",
           COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)::int AS "paidCents"
    FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN professionals p ON p.id = o.professional_id
    WHERE o.account_id = ${accountId}
      AND o.day = ${day}
      AND (
        ${professionalId}::uuid IS NULL
        OR o.professional_id = ${professionalId}
        OR EXISTS (
          SELECT 1 FROM order_lines l
          WHERE l.order_id = o.id AND l.professional_id = ${professionalId}
        )
      )
    ORDER BY o.created_at
  `;
}

export async function getOrder(accountId: string, id: string) {
  const rows = await db()<{
    id: string;
    clientId: string | null;
    clientName: string | null;
    phone: string | null;
    fromOutside: boolean;
    professionalId: string | null;
    professionalName: string | null;
    day: string;
    kind: string;
    status: string;
    incomplete: boolean;
  }[]>`
    SELECT o.id, o.client_id AS "clientId", c.name AS "clientName", c.phone,
           COALESCE(c.from_outside, false) AS "fromOutside",
           o.professional_id AS "professionalId", p.name AS "professionalName",
           to_char(o.day, 'YYYY-MM-DD') AS day, o.kind, o.status, o.incomplete
    FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN professionals p ON p.id = o.professional_id
    WHERE o.account_id = ${accountId} AND o.id = ${id}
  `;
  if (!rows[0]) return null;
  const lines = await db()<{
    id: string;
    kind: string;
    description: string;
    qty: number;
    priceCents: number;
    listPriceCents: number;
    commissionPercent: number;
    commissionCents: number;
    abatementCents: number;
    courtesy: boolean;
    appointmentId: string | null;
    serviceId: string | null;
    professionalId: string | null;
    professionalName: string | null;
    start: string | null;
    end: string | null;
    appointmentStatus: string | null;
    encaixe: boolean;
  }[]>`
    SELECT l.id, l.kind, l.description, l.qty, l.price_cents AS "priceCents",
           l.list_price_cents AS "listPriceCents", l.commission_percent AS "commissionPercent",
           l.commission_cents AS "commissionCents", l.abatement_cents AS "abatementCents",
           l.courtesy, l.appointment_id AS "appointmentId", l.service_id AS "serviceId",
           l.professional_id AS "professionalId",
           p.name AS "professionalName",
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
           to_char(a.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS "end",
           a.status AS "appointmentStatus", COALESCE(a.encaixe, false) AS encaixe
    FROM order_lines l
    LEFT JOIN professionals p ON p.id = l.professional_id
    LEFT JOIN appointments a ON a.id = l.appointment_id
    WHERE l.order_id = ${id}
    ORDER BY l.created_at
  `;
  const payments = await db()<{ id: string; method: string; amountCents: number }[]>`
    SELECT id, method, amount_cents AS "amountCents"
    FROM payments
    WHERE order_id = ${id}
    ORDER BY created_at
  `;
  const events = await db()<{
    id: string;
    kind: string;
    summary: string;
    beforeCents: number | null;
    afterCents: number | null;
    at: string;
    actorName: string | null;
  }[]>`
    SELECT e.id, e.kind, e.summary, e.before_cents AS "beforeCents", e.after_cents AS "afterCents",
           to_char(e.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS at,
           u.name AS "actorName"
    FROM order_events e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.account_id = ${accountId} AND e.order_id = ${id}
    ORDER BY e.created_at DESC
  `;
  return { ...rows[0], lines, payments, events };
}

export async function dayCancellations(accountId: string, day: string, professionalId: string | null) {
  const start = stamp(day, "00:00");
  const end = stamp(day, "23:59");
  return db()<{
    id: string;
    orderId: string | null;
    clientName: string | null;
    professionalName: string | null;
    serviceName: string | null;
    start: string;
    end: string;
    priceCents: number | null;
    at: string | null;
    actorName: string | null;
  }[]>`
    SELECT a.id, a.order_id AS "orderId", c.name AS "clientName", p.name AS "professionalName",
           s.name AS "serviceName",
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
           to_char(a.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS "end",
           e.before_cents AS "priceCents",
           to_char(e.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS at,
           u.name AS "actorName"
    FROM appointments a
    LEFT JOIN clients c ON c.id = a.client_id
    LEFT JOIN professionals p ON p.id = a.professional_id
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN LATERAL (
      SELECT before_cents, created_at, actor_id
      FROM order_events
      WHERE appointment_id = a.id AND kind = 'cancelamento'
      ORDER BY created_at DESC
      LIMIT 1
    ) e ON true
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE a.account_id = ${accountId}
      AND a.kind = 'horario'
      AND a.status = 'cancelado'
      AND a.starts_at < ${end}
      AND a.ends_at > ${start}
      AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId})
    ORDER BY a.starts_at
  `;
}

export async function dayCash(accountId: string, day: string) {
  const movements = await db()<{ label: string; amountCents: number; origin: string }[]>`
    SELECT label, amount_cents AS "amountCents", origin
    FROM cash_movements
    WHERE account_id = ${accountId} AND day = ${day}
    ORDER BY created_at
  `;
  const byMethod = await db()<{ method: string; amountCents: number }[]>`
    SELECT pay.method, SUM(pay.amount_cents)::int AS "amountCents"
    FROM payments pay
    JOIN orders o ON o.id = pay.order_id
    WHERE pay.account_id = ${accountId} AND o.day = ${day}
    GROUP BY pay.method
    ORDER BY pay.method
  `;
  const commissions = await db()<{ name: string; amountCents: number; abatementCents: number }[]>`
    SELECT p.name,
           COALESCE(SUM(l.commission_cents), 0)::int AS "amountCents",
           COALESCE(SUM(l.abatement_cents), 0)::int AS "abatementCents"
    FROM order_lines l
    JOIN orders o ON o.id = l.order_id
    JOIN professionals p ON p.id = l.professional_id
    WHERE o.account_id = ${accountId} AND o.day = ${day}
    GROUP BY p.name
    ORDER BY p.name
  `;
  return { movements, byMethod, commissions };
}
