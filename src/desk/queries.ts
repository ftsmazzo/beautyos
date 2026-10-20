import { todaySaoPaulo } from "@/catalog/format";
import { db } from "@/db/client";
import { shiftDay, stamp } from "@/desk/clock";
import { classifyReturn, RETURN_WORD, type ReturnFacts } from "@/desk/returns";

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

export async function weekSlotCounts(accountId: string, start: string, end: string, professionalId: string | null) {
  const from = stamp(start, "00:00");
  const until = stamp(end, "23:59");
  return db()<{ day: string; qty: number }[]>`
    SELECT to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
           count(*)::int AS qty
    FROM appointments a
    WHERE a.account_id = ${accountId}
      AND a.kind = 'horario'
      AND a.status <> 'cancelado'
      AND a.starts_at < ${until}
      AND a.ends_at > ${from}
      AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId})
    GROUP BY 1
    ORDER BY 1
  `;
}

export async function deskPulse(accountId: string, day: string, professionalId: string | null) {
  const tomorrow = shiftDay(day, 1);
  const start = stamp(day, "00:00");
  const end = stamp(day, "23:59");
  const nextStart = stamp(tomorrow, "00:00");
  const nextEnd = stamp(tomorrow, "23:59");
  const [todayRows, tomorrowRows, openRows, floorRows, consumption] = await Promise.all([
    db()<{
      id: string;
      time: string;
      clientName: string | null;
      serviceName: string | null;
      status: string;
      orderId: string | null;
    }[]>`
      SELECT a.id,
             to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS time,
             c.name AS "clientName", s.name AS "serviceName", a.status, a.order_id AS "orderId"
      FROM appointments a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.account_id = ${accountId}
        AND a.kind = 'horario'
        AND a.status <> 'cancelado'
        AND a.starts_at < ${end}
        AND a.ends_at > ${start}
        AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId})
      ORDER BY a.starts_at
      LIMIT 12
    `,
    db()<{ qty: number }[]>`
      SELECT count(*)::int AS qty
      FROM appointments a
      WHERE a.account_id = ${accountId}
        AND a.kind = 'horario'
        AND a.status <> 'cancelado'
        AND a.starts_at < ${nextEnd}
        AND a.ends_at > ${nextStart}
        AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId})
    `,
    db()<{ id: string; who: string; gapCents: number; day: string }[]>`
      SELECT o.id,
             COALESCE(c.name, p.name, 'Sem nome') AS who,
             to_char(o.day, 'YYYY-MM-DD') AS day,
             (
               COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)
               - COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)
             )::int AS "gapCents"
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      LEFT JOIN professionals p ON p.id = o.professional_id
      WHERE o.account_id = ${accountId}
        AND o.status = 'aberta'
        AND o.day = ${day}::date
        AND (
          COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)
          - COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)
        ) > 0
        AND (${professionalId}::uuid IS NULL OR o.professional_id = ${professionalId}
          OR EXISTS (
            SELECT 1 FROM order_lines l
            WHERE l.order_id = o.id AND l.professional_id = ${professionalId}
          ))
      ORDER BY o.created_at
      LIMIT 8
    `,
    db()<{
      id: string;
      time: string;
      clientName: string | null;
      phone: string | null;
      serviceName: string | null;
      professionalName: string;
      status: string;
      orderId: string | null;
      waitMin: number | null;
    }[]>`
      SELECT a.id,
             to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS time,
             c.name AS "clientName", c.phone, s.name AS "serviceName", pr.name AS "professionalName",
             a.status, a.order_id AS "orderId",
             CASE
               WHEN a.arrived_at IS NOT NULL AND a.started_at IS NOT NULL
               THEN GREATEST(0, floor(extract(epoch FROM (a.started_at - a.arrived_at)) / 60))::int
               WHEN a.arrived_at IS NOT NULL AND a.status = 'chegou'
               THEN GREATEST(0, floor(extract(epoch FROM (now() - a.arrived_at)) / 60))::int
               ELSE NULL
             END AS "waitMin"
      FROM appointments a
      LEFT JOIN clients c ON c.id = a.client_id
      LEFT JOIN services s ON s.id = a.service_id
      JOIN professionals pr ON pr.id = a.professional_id
      WHERE a.account_id = ${accountId}
        AND a.kind = 'horario'
        AND a.status IN ('chegou', 'em_atendimento')
        AND a.starts_at < ${end}
        AND a.ends_at > ${start}
        AND (${professionalId}::uuid IS NULL OR a.professional_id = ${professionalId})
      ORDER BY CASE a.status WHEN 'chegou' THEN 0 ELSE 1 END, a.starts_at
    `,
    professionalId
      ? db()<{ id: string; status: string }[]>`
          SELECT id, status FROM orders
          WHERE account_id = ${accountId}
            AND professional_id = ${professionalId}
            AND day = ${day}::date
            AND kind = 'consumo'
          LIMIT 1
        `
      : Promise.resolve([] as { id: string; status: string }[]),
  ]);
  return {
    todaySlots: todayRows,
    tomorrowQty: tomorrowRows[0]?.qty ?? 0,
    openOrders: openRows,
    floor: floorRows,
    consumption: consumption[0] ?? null,
  };
}

export async function deskReceivables(accountId: string, professionalId: string | null) {
  return db()<{
    id: string;
    who: string;
    phone: string | null;
    day: string;
    totalCents: number;
    paidCents: number;
    gapCents: number;
  }[]>`
    SELECT o.id,
           COALESCE(c.name, 'Sem nome') AS who,
           c.phone,
           to_char(o.day, 'YYYY-MM-DD') AS day,
           COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)::int AS "totalCents",
           COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)::int AS "paidCents",
           (
             COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)
             - COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)
           )::int AS "gapCents"
    FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
    WHERE o.account_id = ${accountId}
      AND o.status = 'aberta'
      AND o.kind = 'cliente'
      AND (
        COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)
        - COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)
      ) > 0
      AND (
        ${professionalId}::uuid IS NULL
        OR o.professional_id = ${professionalId}
        OR EXISTS (
          SELECT 1 FROM order_lines l
          WHERE l.order_id = o.id AND l.professional_id = ${professionalId}
        )
      )
    ORDER BY o.day, COALESCE(c.name, ''), o.created_at
    LIMIT 100
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
    orderStatus: string | null;
    start: string;
    end: string;
    status: string;
    encaixe: boolean;
    kind: string;
    waitMin: number | null;
  }[]>`
    SELECT a.id, a.professional_id AS "professionalId", a.client_id AS "clientId",
           c.name AS "clientName", c.phone, COALESCE(c.from_outside, false) AS "fromOutside",
           s.name AS "serviceName", a.order_id AS "orderId", o.status AS "orderStatus",
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
           to_char(a.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS "end",
           a.status, a.encaixe, a.kind,
           CASE
             WHEN a.arrived_at IS NOT NULL AND a.started_at IS NOT NULL
             THEN GREATEST(0, floor(extract(epoch FROM (a.started_at - a.arrived_at)) / 60))::int
             WHEN a.arrived_at IS NOT NULL AND a.status = 'chegou'
             THEN GREATEST(0, floor(extract(epoch FROM (now() - a.arrived_at)) / 60))::int
             ELSE NULL
           END AS "waitMin"
    FROM appointments a
    LEFT JOIN clients c ON c.id = a.client_id
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN orders o ON o.id = a.order_id
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
  return db()<{ id: string; name: string; priceCents: number; barcode: string | null }[]>`
    SELECT id, name, sale_price_cents AS "priceCents", barcode
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
    lineCount: number;
    packageNote: string | null;
  }[]>`
    SELECT o.id, c.name AS "clientName", c.phone, o.kind, o.status, o.incomplete,
           p.name AS "professionalName",
           COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)::int AS "totalCents",
           COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)::int AS "paidCents",
           COALESCE((SELECT count(*) FROM order_lines l WHERE l.order_id = o.id), 0)::int AS "lineCount",
           (
             SELECT string_agg(note, ' · ' ORDER BY sort NULLS LAST)
             FROM (
               SELECT
                 cp.name || CASE
                   WHEN cp.valid_until IS NULL THEN ' · prazo ainda não começou'
                   WHEN cp.valid_until < ${day}::date OR EXISTS (
                     SELECT 1
                     FROM package_credits cr
                     LEFT JOIN order_lines ol ON ol.id = cr.order_line_id
                     JOIN appointments ap ON ap.id = COALESCE(ol.appointment_id, cr.appointment_id) AND ap.status <> 'cancelado'
                     WHERE cr.client_package_id = cp.id
                       AND (ap.starts_at AT TIME ZONE 'America/Sao_Paulo')::date > cp.valid_until
                   ) THEN ' · vencido em ' || to_char(cp.valid_until, 'DD/MM/YYYY')
                   ELSE ' · válido até ' || to_char(cp.valid_until, 'DD/MM/YYYY')
                 END || CASE
                   WHEN EXISTS (SELECT 1 FROM package_pardons pp WHERE pp.client_package_id = cp.id)
                     THEN ' · já houve perdão'
                   ELSE ''
                 END AS note,
                 cp.valid_until AS sort
               FROM client_packages cp
               WHERE cp.account_id = o.account_id AND cp.client_id = o.client_id AND cp.status = 'ativo'
             ) notes
           ) AS "packageNote"
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

export async function listedOrders(
  accountId: string,
  status: "aberta" | "fechada",
  professionalId: string | null,
  today: string,
  start: string | null,
  end: string | null,
  q: string | null,
) {
  const pattern = q ? `%${q.replace(/[%_\\]/g, "")}%` : null;
  const digits = q?.replace(/\D/g, "") ?? "";
  const digitPattern = digits.length >= 3 ? `%${digits}%` : null;
  const rows = await db()<{
    id: string;
    day: string;
    clientName: string | null;
    phone: string | null;
    kind: string;
    status: string;
    incomplete: boolean;
    professionalName: string | null;
    totalCents: number;
    paidCents: number;
    lineCount: number;
    packageNote: string | null;
  }[]>`
    SELECT o.id, to_char(o.day, 'YYYY-MM-DD') AS day, c.name AS "clientName", c.phone, o.kind, o.status, o.incomplete,
           p.name AS "professionalName",
           COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)::int AS "totalCents",
           COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)::int AS "paidCents",
           COALESCE((SELECT count(*) FROM order_lines l WHERE l.order_id = o.id), 0)::int AS "lineCount",
           (
             SELECT string_agg(note, ' · ' ORDER BY sort NULLS LAST)
             FROM (
               SELECT
                 cp.name || CASE
                   WHEN cp.valid_until IS NULL THEN ' · prazo ainda não começou'
                   WHEN cp.valid_until < ${today}::date OR EXISTS (
                     SELECT 1
                     FROM package_credits cr
                     LEFT JOIN order_lines ol ON ol.id = cr.order_line_id
                     JOIN appointments ap ON ap.id = COALESCE(ol.appointment_id, cr.appointment_id) AND ap.status <> 'cancelado'
                     WHERE cr.client_package_id = cp.id
                       AND (ap.starts_at AT TIME ZONE 'America/Sao_Paulo')::date > cp.valid_until
                   ) THEN ' · vencido em ' || to_char(cp.valid_until, 'DD/MM/YYYY')
                   ELSE ' · válido até ' || to_char(cp.valid_until, 'DD/MM/YYYY')
                 END || CASE
                   WHEN EXISTS (SELECT 1 FROM package_pardons pp WHERE pp.client_package_id = cp.id)
                     THEN ' · já houve perdão'
                   ELSE ''
                 END AS note,
                 cp.valid_until AS sort
               FROM client_packages cp
               WHERE cp.account_id = o.account_id AND cp.client_id = o.client_id AND cp.status = 'ativo'
             ) notes
           ) AS "packageNote"
    FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN professionals p ON p.id = o.professional_id
    WHERE o.account_id = ${accountId}
      AND o.status = ${status}
      AND (${start}::date IS NULL OR o.day >= ${start}::date)
      AND (${end}::date IS NULL OR o.day <= ${end}::date)
      AND (
        ${professionalId}::uuid IS NULL
        OR o.professional_id = ${professionalId}
        OR EXISTS (
          SELECT 1 FROM order_lines l
          WHERE l.order_id = o.id AND l.professional_id = ${professionalId}
        )
      )
      AND (
        ${pattern}::text IS NULL
        OR c.name ILIKE ${pattern}
        OR p.name ILIKE ${pattern}
        OR (${digitPattern}::text IS NOT NULL AND regexp_replace(COALESCE(c.phone, ''), '\\D', '', 'g') LIKE ${digitPattern})
      )
    ORDER BY o.day, COALESCE(c.name, p.name, '')
    LIMIT 400
  `;
  return status === "fechada" ? rows.reverse() : rows;
}

export async function cashBook(accountId: string, start: string, end: string) {
  const methods = await db()<{ day: string; method: string; amountCents: number }[]>`
    SELECT to_char(o.day, 'YYYY-MM-DD') AS day, pay.method, SUM(pay.amount_cents)::int AS "amountCents"
    FROM payments pay
    JOIN orders o ON o.id = pay.order_id
    WHERE pay.account_id = ${accountId}
      AND o.day >= ${start}::date
      AND o.day <= ${end}::date
      AND pay.bank_account_id IS NULL
      AND pay.method <> 'conta'
    GROUP BY o.day, pay.method
  `;
  const movements = await db()<{ day: string; origin: string; amountCents: number; qty: number }[]>`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, origin, SUM(amount_cents)::int AS "amountCents", count(*)::int AS qty
    FROM cash_movements
    WHERE account_id = ${accountId}
      AND day >= ${start}::date
      AND day <= ${end}::date
      AND origin <> 'pagamento'
    GROUP BY day, origin
  `;
  const banks = await db()<{ day: string; amountCents: number }[]>`
    SELECT to_char(o.day, 'YYYY-MM-DD') AS day, SUM(pay.amount_cents)::int AS "amountCents"
    FROM payments pay
    JOIN orders o ON o.id = pay.order_id
    WHERE pay.account_id = ${accountId}
      AND o.day >= ${start}::date
      AND o.day <= ${end}::date
      AND pay.bank_account_id IS NOT NULL
    GROUP BY o.day
  `;
  return { methods, movements, banks };
}

export async function getOrder(accountId: string, id: string) {
  const rows = await db()<{
    id: string;
    clientId: string | null;
    clientName: string | null;
    phone: string | null;
    fromOutside: boolean;
    channel: string;
    professionalId: string | null;
    professionalName: string | null;
    day: string;
    kind: string;
    status: string;
    incomplete: boolean;
  }[]>`
    SELECT o.id, o.client_id AS "clientId", c.name AS "clientName", c.phone,
           COALESCE(c.from_outside, false) AS "fromOutside",
           COALESCE(c.channel, 'nao_informado') AS channel,
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
    referralCents: number;
    courtesy: boolean;
    packageCreditId: string | null;
    appointmentId: string | null;
    serviceId: string | null;
    professionalId: string | null;
    professionalName: string | null;
    start: string | null;
    end: string | null;
    appointmentStatus: string | null;
    encaixe: boolean;
    waitMin: number | null;
  }[]>`
    SELECT l.id, l.kind, l.description, l.qty, l.price_cents AS "priceCents",
           l.list_price_cents AS "listPriceCents", l.commission_percent AS "commissionPercent",
           l.commission_cents AS "commissionCents", l.abatement_cents AS "abatementCents",
           l.referral_cents AS "referralCents",
           l.courtesy, l.package_credit_id AS "packageCreditId", l.appointment_id AS "appointmentId", l.service_id AS "serviceId",
           l.professional_id AS "professionalId",
           p.name AS "professionalName",
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
           to_char(a.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS "end",
           a.status AS "appointmentStatus", COALESCE(a.encaixe, false) AS encaixe,
           CASE
             WHEN a.arrived_at IS NOT NULL AND a.started_at IS NOT NULL
             THEN GREATEST(0, floor(extract(epoch FROM (a.started_at - a.arrived_at)) / 60))::int
             WHEN a.arrived_at IS NOT NULL AND a.status = 'chegou'
             THEN GREATEST(0, floor(extract(epoch FROM (now() - a.arrived_at)) / 60))::int
             ELSE NULL
           END AS "waitMin"
    FROM order_lines l
    LEFT JOIN professionals p ON p.id = l.professional_id
    LEFT JOIN appointments a ON a.id = l.appointment_id
    WHERE l.order_id = ${id}
    ORDER BY l.created_at
  `;
  const payments = await db()<{ id: string; method: string; amountCents: number; feeCents: number; bankName: string | null }[]>`
    SELECT pay.id, pay.method, pay.amount_cents AS "amountCents", pay.fee_cents AS "feeCents", b.name AS "bankName"
    FROM payments pay
    LEFT JOIN bank_accounts b ON b.id = pay.bank_account_id
    WHERE pay.order_id = ${id}
    ORDER BY pay.created_at
  `;
  return { ...rows[0], lines, payments };
}

export async function visitNotes(accountId: string, orderId: string) {
  return db()<{ id: string; appointmentId: string; body: string; who: string; at: string }[]>`
    SELECT n.id, n.appointment_id AS "appointmentId", n.body,
           COALESCE(u.name, 'Balcão') AS who,
           to_char(n.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS at
    FROM visit_notes n
    LEFT JOIN users u ON u.id = n.created_by
    WHERE n.account_id = ${accountId}
      AND n.appointment_id IN (
        SELECT l.appointment_id FROM order_lines l
        WHERE l.order_id = ${orderId} AND l.appointment_id IS NOT NULL
      )
    ORDER BY n.created_at
  `;
}

export async function dayLogs(accountId: string, day: string) {
  return periodLogs(accountId, day, day, null);
}

export async function periodLogs(accountId: string, startDay: string, endDay: string, kind: string | null) {
  const start = stamp(startDay, "00:00");
  const end = stamp(shiftDay(endDay, 1), "00:00");
  return db()<{
    id: string;
    kind: string;
    summary: string;
    at: string;
    day: string;
    actorName: string | null;
    orderId: string | null;
    clientName: string | null;
    orderDay: string | null;
  }[]>`
    SELECT e.id, e.kind, e.summary,
           to_char(e.created_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS at,
           to_char(e.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
           u.name AS "actorName",
           e.order_id AS "orderId",
           c.name AS "clientName",
           to_char(o.day, 'DD/MM/YYYY') AS "orderDay"
    FROM order_events e
    LEFT JOIN users u ON u.id = e.actor_id
    LEFT JOIN orders o ON o.id = e.order_id
    LEFT JOIN clients c ON c.id = o.client_id
    WHERE e.account_id = ${accountId}
      AND e.created_at >= ${start}
      AND e.created_at < ${end}
      AND (${kind}::text IS NULL OR e.kind = ${kind})
    ORDER BY e.created_at DESC
    LIMIT 400
  `;
}

export async function packagesForSale(accountId: string) {
  return db()<{ id: string; name: string; priceCents: number; validityDays: number }[]>`
    SELECT id, name, price_cents AS "priceCents", validity_days AS "validityDays"
    FROM packages
    WHERE account_id = ${accountId} AND for_sale
    ORDER BY name
  `;
}

export async function clientPackages(accountId: string, clientId: string, day: string) {
  return db()<{
    id: string;
    name: string;
    validUntil: string | null;
    validUntilIso: string | null;
    started: boolean;
    expired: boolean;
    late: boolean;
    pardons: number;
    total: number;
    used: number;
  }[]>`
    SELECT cp.id, cp.name,
           to_char(cp.valid_until, 'DD/MM/YYYY') AS "validUntil",
           to_char(cp.valid_until, 'YYYY-MM-DD') AS "validUntilIso",
           cp.first_used_on IS NOT NULL AS started,
           (cp.valid_until IS NOT NULL AND cp.valid_until < ${day}::date) AS expired,
           EXISTS (
             SELECT 1
             FROM package_credits c
             LEFT JOIN order_lines l ON l.id = c.order_line_id
             JOIN appointments a ON a.id = COALESCE(l.appointment_id, c.appointment_id) AND a.status <> 'cancelado'
             WHERE c.client_package_id = cp.id
               AND cp.valid_until IS NOT NULL
               AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date > cp.valid_until
           ) AS late,
           (SELECT count(*) FROM package_pardons p WHERE p.client_package_id = cp.id)::int AS pardons,
           (SELECT count(*) FROM package_credits c WHERE c.client_package_id = cp.id)::int AS total,
           (SELECT count(*) FROM package_credits c WHERE c.client_package_id = cp.id AND c.status = 'usado')::int AS used
    FROM client_packages cp
    WHERE cp.account_id = ${accountId} AND cp.client_id = ${clientId} AND cp.status = 'ativo'
    ORDER BY cp.created_at
  `;
}

export async function packageVisits(accountId: string, clientId: string) {
  return db()<{
    id: string;
    packageId: string;
    serviceId: string;
    serviceName: string;
    status: string;
    when: string | null;
    day: string | null;
    professionalName: string | null;
    late: boolean;
    internalPriceCents: number;
    listPriceCents: number | null;
  }[]>`
    SELECT c.id, cp.id AS "packageId", c.service_id AS "serviceId", s.name AS "serviceName", c.status,
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS "when",
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
           pr.name AS "professionalName",
           (
             cp.valid_until IS NOT NULL
             AND a.starts_at IS NOT NULL
             AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date > cp.valid_until
           ) AS late,
           c.internal_price_cents AS "internalPriceCents",
           COALESCE(l.list_price_cents, s.price_cents) AS "listPriceCents"
    FROM package_credits c
    JOIN client_packages cp ON cp.id = c.client_package_id
    JOIN services s ON s.id = c.service_id
    LEFT JOIN order_lines l ON l.id = c.order_line_id
    LEFT JOIN appointments a ON a.id = COALESCE(l.appointment_id, c.appointment_id) AND a.status <> 'cancelado'
    LEFT JOIN professionals pr ON pr.id = COALESCE(a.professional_id, l.professional_id)
    WHERE cp.account_id = ${accountId} AND cp.client_id = ${clientId} AND cp.status = 'ativo'
    ORDER BY cp.created_at, c.position
  `;
}

export type SoldPackage = {
  id: string;
  clientName: string;
  phone: string | null;
  name: string;
  priceCents: number;
  status: string;
  validUntil: string | null;
  started: boolean;
  expired: boolean;
  late: boolean;
  pardons: number;
  total: number;
  used: number;
  waiting: boolean;
  nextVisit: string | null;
  orderId: string | null;
  cancelReason: string | null;
};

export async function latePackageVisits(accountId: string) {
  return db()<{
    creditId: string;
    packageId: string;
    clientName: string;
    packageName: string;
    when: string;
    professional: string;
  }[]>`
    SELECT cr.id AS "creditId", cp.id AS "packageId", c.name AS "clientName", cp.name AS "packageName",
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS "when",
           COALESCE(pr.name, 'sem profissional') AS professional
    FROM client_packages cp
    JOIN clients c ON c.id = cp.client_id
    JOIN package_credits cr ON cr.client_package_id = cp.id
    LEFT JOIN order_lines l ON l.id = cr.order_line_id
    JOIN appointments a ON a.id = COALESCE(l.appointment_id, cr.appointment_id) AND a.status <> 'cancelado'
    LEFT JOIN professionals pr ON pr.id = COALESCE(a.professional_id, l.professional_id)
    WHERE cp.account_id = ${accountId}
      AND cp.status = 'ativo'
      AND cp.valid_until IS NOT NULL
      AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date > cp.valid_until
    ORDER BY a.starts_at, c.name
  `;
}

export async function overdueReturns(accountId: string, day: string) {
  return db()<{
    id: string;
    serviceId: string;
    name: string;
    phone: string;
    serviceName: string;
    due: string;
    lateDays: number;
  }[]>`
    SELECT c.id, s.id AS "serviceId", c.name, c.phone, s.name AS "serviceName",
           to_char(last.day + s.return_days, 'DD/MM/YYYY') AS due,
           (${day}::date - (last.day + s.return_days))::int AS "lateDays"
    FROM clients c
    JOIN LATERAL (
      SELECT DISTINCT ON (a.service_id)
             (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
             a.service_id
      FROM appointments a
      WHERE a.client_id = c.id
        AND a.account_id = c.account_id
        AND a.kind = 'horario'
        AND a.status = 'realizado'
        AND a.service_id IS NOT NULL
      ORDER BY a.service_id, a.starts_at DESC
    ) last ON true
    JOIN services s ON s.id = last.service_id AND s.return_days IS NOT NULL
    WHERE c.account_id = ${accountId}
      AND c.active
      AND NOT c.from_outside
      AND (last.day + s.return_days) < ${day}::date
      AND NOT EXISTS (
        SELECT 1 FROM appointments n
        WHERE n.client_id = c.id
          AND n.service_id = last.service_id
          AND n.kind = 'horario'
          AND n.status <> 'cancelado'
          AND (n.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${day}::date
      )
      AND NOT EXISTS (
        SELECT 1
        FROM client_packages cp
        JOIN package_credits cr ON cr.client_package_id = cp.id AND cr.service_id = last.service_id
        WHERE cp.client_id = c.id AND cp.account_id = c.account_id AND cp.status = 'ativo'
      )
    ORDER BY last.day + s.return_days, c.name, s.name
  `;
}

export async function soldPackages(accountId: string, day: string) {
  return db()<SoldPackage[]>`
    SELECT cp.id, c.name AS "clientName", c.phone, cp.name, cp.price_cents AS "priceCents", cp.status,
           to_char(cp.valid_until, 'YYYY-MM-DD') AS "validUntil",
           cp.first_used_on IS NOT NULL AS started,
           (cp.valid_until IS NOT NULL AND cp.valid_until < ${day}::date) AS expired,
           EXISTS (
             SELECT 1
             FROM package_credits cr
             LEFT JOIN order_lines l ON l.id = cr.order_line_id
             JOIN appointments a ON a.id = COALESCE(l.appointment_id, cr.appointment_id) AND a.status <> 'cancelado'
             WHERE cr.client_package_id = cp.id
               AND cp.valid_until IS NOT NULL
               AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date > cp.valid_until
           ) AS late,
           (SELECT count(*) FROM package_pardons p WHERE p.client_package_id = cp.id)::int AS pardons,
           (SELECT count(*) FROM package_credits cr WHERE cr.client_package_id = cp.id)::int AS total,
           (SELECT count(*) FROM package_credits cr WHERE cr.client_package_id = cp.id AND cr.status = 'usado')::int AS used,
           EXISTS (
             SELECT 1 FROM package_credits cr
             WHERE cr.client_package_id = cp.id AND cr.status = 'falta_agendar'
           ) AS waiting,
           COALESCE(
             (
               SELECT to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                      || ' · ' || COALESCE(pr.name, 'sem profissional')
               FROM package_credits cr
               LEFT JOIN order_lines l ON l.id = cr.order_line_id
               JOIN appointments a ON a.id = COALESCE(l.appointment_id, cr.appointment_id) AND a.status <> 'cancelado'
               LEFT JOIN professionals pr ON pr.id = COALESCE(a.professional_id, l.professional_id)
               WHERE cr.client_package_id = cp.id AND cr.status <> 'usado'
               ORDER BY a.starts_at
               LIMIT 1
             ),
             CASE WHEN EXISTS (
               SELECT 1 FROM package_credits cr
               WHERE cr.client_package_id = cp.id AND cr.status = 'falta_agendar'
             ) THEN 'falta agendar' END
           ) AS "nextVisit",
           cp.order_id AS "orderId",
           cp.cancel_reason AS "cancelReason"
    FROM client_packages cp
    JOIN clients c ON c.id = cp.client_id
    WHERE cp.account_id = ${accountId}
    ORDER BY cp.valid_until NULLS LAST, c.name
  `;
}

export async function soldPackage(accountId: string, id: string, day: string) {
  const rows = await soldPackages(accountId, day);
  return rows.find((row) => row.id === id) ?? null;
}

export async function soldPackageVisits(accountId: string, id: string) {
  return db()<{
    id: string;
    serviceId: string;
    serviceName: string;
    status: string;
    when: string | null;
    day: string | null;
    start: string | null;
    professionalId: string | null;
    professionalName: string | null;
    orderId: string | null;
    late: boolean;
    internalPriceCents: number;
    listPriceCents: number;
  }[]>`
    SELECT cr.id, cr.service_id AS "serviceId", s.name AS "serviceName", cr.status,
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS "when",
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
           COALESCE(a.professional_id, l.professional_id) AS "professionalId",
           pr.name AS "professionalName",
           COALESCE(l.order_id, a.order_id) AS "orderId",
           (
             cp.valid_until IS NOT NULL
             AND a.starts_at IS NOT NULL
             AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date > cp.valid_until
           ) AS late,
           cr.internal_price_cents AS "internalPriceCents",
           COALESCE(l.list_price_cents, s.price_cents) AS "listPriceCents"
    FROM package_credits cr
    JOIN client_packages cp ON cp.id = cr.client_package_id
    JOIN services s ON s.id = cr.service_id
    LEFT JOIN order_lines l ON l.id = cr.order_line_id
    LEFT JOIN appointments a ON a.id = COALESCE(l.appointment_id, cr.appointment_id) AND a.status <> 'cancelado'
    LEFT JOIN professionals pr ON pr.id = COALESCE(a.professional_id, l.professional_id)
    WHERE cp.account_id = ${accountId} AND cp.id = ${id}
    ORDER BY cr.position
  `;
}

export async function packageServiceIds(accountId: string, clientId: string, day: string) {
  const rows = await db()<{ serviceId: string }[]>`
    SELECT DISTINCT c.service_id AS "serviceId"
    FROM package_credits c
    JOIN client_packages cp ON cp.id = c.client_package_id
    WHERE cp.account_id = ${accountId}
      AND cp.client_id = ${clientId}
      AND cp.status = 'ativo'
      AND c.status = 'falta_agendar'
      AND (cp.valid_until IS NULL OR cp.valid_until >= ${day}::date)
  `;
  return rows.map((row) => row.serviceId);
}

export async function dayCancellations(accountId: string, day: string, professionalId: string | null) {
  const start = stamp(day, "00:00");
  const end = stamp(day, "23:59");
  return db()<{
    id: string;
    orderId: string | null;
    clientId: string | null;
    clientName: string | null;
    professionalName: string | null;
    serviceName: string | null;
    start: string;
    end: string;
    priceCents: number | null;
    at: string | null;
    actorName: string | null;
  }[]>`
    SELECT a.id, a.order_id AS "orderId", a.client_id AS "clientId", c.name AS "clientName", p.name AS "professionalName",
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
      AND pay.bank_account_id IS NULL AND pay.method <> 'conta'
    GROUP BY pay.method
    ORDER BY pay.method
  `;
  const banks = await db()<{ bank: string; method: string; amountCents: number; feeCents: number }[]>`
    SELECT b.name AS bank, pay.method,
           SUM(pay.amount_cents)::int AS "amountCents",
           SUM(pay.fee_cents)::int AS "feeCents"
    FROM payments pay
    JOIN orders o ON o.id = pay.order_id
    JOIN bank_accounts b ON b.id = pay.bank_account_id
    WHERE pay.account_id = ${accountId} AND o.day = ${day}::date
    GROUP BY b.name, pay.method
    ORDER BY b.name, pay.method
  `;
  const openGaps = await db()<{ id: string; who: string; gapCents: number }[]>`
    SELECT o.id, COALESCE(c.name, 'Sem nome') AS who,
           (
             COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)
             - COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)
           )::int AS "gapCents"
    FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
    WHERE o.account_id = ${accountId}
      AND o.day = ${day}::date
      AND o.status = 'aberta'
      AND o.kind = 'cliente'
      AND (
        COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)
        - COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)
      ) > 0
    ORDER BY c.name NULLS LAST
  `;
  const commissions = await db()<{ name: string; amountCents: number; abatementCents: number }[]>`
    SELECT name,
           SUM(amount)::int AS "amountCents",
           SUM(abatement)::int AS "abatementCents"
    FROM (
      SELECT p.name AS name,
             l.commission_cents AS amount,
             CASE WHEN o.kind = 'consumo' AND l.kind = 'servico' THEN 0 ELSE l.abatement_cents END AS abatement
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      JOIN professionals p ON p.id = l.professional_id
      WHERE o.account_id = ${accountId} AND o.day = ${day}
      UNION ALL
      SELECT r.name, 0, l.abatement_cents
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      JOIN professionals r ON r.id = o.professional_id
      WHERE o.account_id = ${accountId} AND o.day = ${day}
        AND o.kind = 'consumo' AND l.kind = 'servico' AND l.abatement_cents > 0
      UNION ALL
      SELECT p.name, l.referral_cents, 0
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      JOIN professionals p ON p.id = l.referrer_professional_id
      WHERE o.account_id = ${accountId} AND o.day = ${day} AND l.referral_cents > 0
      UNION ALL
      SELECT c.name, l.referral_cents, 0
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      JOIN clients c ON c.id = l.referrer_client_id
      WHERE o.account_id = ${accountId} AND o.day = ${day} AND l.referral_cents > 0
    ) rows
    GROUP BY name
    ORDER BY name
  `;
  return { movements, byMethod, banks, openGaps, commissions };
}

export async function ownCommission(accountId: string, professionalId: string, day: string) {
  const rows = await db()<{
    origin: string;
    description: string;
    commissionCents: number;
    abatementCents: number;
  }[]>`
    SELECT origin, description,
           commission_cents AS "commissionCents",
           abatement_cents AS "abatementCents"
    FROM (
      SELECT 'execucao' AS origin, l.description,
             l.commission_cents,
             CASE WHEN o.kind = 'consumo' AND l.kind = 'servico' THEN 0 ELSE l.abatement_cents END AS abatement_cents
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      WHERE o.account_id = ${accountId} AND o.day = ${day} AND l.professional_id = ${professionalId}
      UNION ALL
      SELECT 'abate', l.description, 0, l.abatement_cents
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      WHERE o.account_id = ${accountId} AND o.day = ${day}
        AND o.kind = 'consumo' AND l.kind = 'servico' AND l.abatement_cents > 0
        AND o.professional_id = ${professionalId}
      UNION ALL
      SELECT 'indicacao', l.description, l.referral_cents, 0
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      WHERE o.account_id = ${accountId} AND o.day = ${day}
        AND l.referral_cents > 0 AND l.referrer_professional_id = ${professionalId}
    ) rows
    ORDER BY origin, description
  `;
  const commissionCents = rows.reduce((sum, row) => sum + row.commissionCents, 0);
  const abatementCents = rows.reduce((sum, row) => sum + row.abatementCents, 0);
  return { rows, commissionCents, abatementCents };
}

export type CommissionLine = {
  day: string;
  orderId: string;
  personId: string;
  personName: string;
  origin: string;
  description: string;
  commissionCents: number;
  abatementCents: number;
  feeCents: number;
  clientName: string;
};

export async function commissionBook(accountId: string, start: string, end: string, professionalId: string | null) {
  return db()<CommissionLine[]>`
    SELECT to_char(o.day, 'YYYY-MM-DD') AS day,
           o.id AS "orderId",
           l.professional_id AS "personId",
           p.name AS "personName",
           CASE WHEN l.kind = 'pacote' THEN 'venda' ELSE 'execucao' END AS origin,
           l.description,
           l.commission_cents AS "commissionCents",
           GREATEST(0, shown.abatement - shown.fee) AS "abatementCents",
           shown.fee AS "feeCents",
           COALESCE(c.name, CASE WHEN o.kind = 'consumo' THEN 'Consumo interno' ELSE 'Sem nome' END) AS "clientName"
    FROM order_lines l
    JOIN orders o ON o.id = l.order_id
    JOIN professionals p ON p.id = l.professional_id
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(f.abatement_cents), 0)::int AS fee
      FROM card_fee_shares f
      WHERE f.line_id = l.id AND f.account_id = o.account_id
    ) raw ON true
    CROSS JOIN LATERAL (
      SELECT
        CASE WHEN o.kind = 'consumo' AND l.kind = 'servico' THEN 0 ELSE l.abatement_cents END AS abatement,
        CASE WHEN o.kind = 'consumo' AND l.kind = 'servico' THEN 0 ELSE LEAST(l.abatement_cents, raw.fee) END AS fee
    ) shown
    WHERE o.account_id = ${accountId}
      AND o.day >= ${start}::date
      AND o.day <= ${end}::date
      AND (${professionalId}::uuid IS NULL OR l.professional_id = ${professionalId})
      AND (l.commission_cents <> 0 OR shown.abatement <> 0)
    UNION ALL
    SELECT to_char(o.day, 'YYYY-MM-DD'),
           o.id,
           o.professional_id,
           r.name,
           'abate',
           l.description,
           0,
           l.abatement_cents,
           0,
           'Consumo interno'
    FROM order_lines l
    JOIN orders o ON o.id = l.order_id
    JOIN professionals r ON r.id = o.professional_id
    WHERE o.account_id = ${accountId}
      AND o.day >= ${start}::date
      AND o.day <= ${end}::date
      AND o.kind = 'consumo'
      AND l.kind = 'servico'
      AND l.abatement_cents > 0
      AND (${professionalId}::uuid IS NULL OR o.professional_id = ${professionalId})
    UNION ALL
    SELECT to_char(o.day, 'YYYY-MM-DD'),
           o.id,
           l.referrer_professional_id,
           p.name,
           'indicacao',
           l.description,
           l.referral_cents,
           0,
           0,
           COALESCE(c.name, 'Sem nome')
    FROM order_lines l
    JOIN orders o ON o.id = l.order_id
    JOIN professionals p ON p.id = l.referrer_professional_id
    LEFT JOIN clients c ON c.id = o.client_id
    WHERE o.account_id = ${accountId}
      AND o.day >= ${start}::date
      AND o.day <= ${end}::date
      AND l.referral_cents > 0
      AND (${professionalId}::uuid IS NULL OR l.referrer_professional_id = ${professionalId})
    UNION ALL
    SELECT to_char(o.day, 'YYYY-MM-DD'),
           o.id,
           l.referrer_client_id,
           c2.name,
           'indicacao',
           l.description,
           l.referral_cents,
           0,
           0,
           COALESCE(c.name, 'Sem nome')
    FROM order_lines l
    JOIN orders o ON o.id = l.order_id
    JOIN clients c2 ON c2.id = l.referrer_client_id
    LEFT JOIN clients c ON c.id = o.client_id
    WHERE o.account_id = ${accountId}
      AND o.day >= ${start}::date
      AND o.day <= ${end}::date
      AND l.referral_cents > 0
      AND ${professionalId}::uuid IS NULL
    ORDER BY day, "personName", origin, description
  `;
}

export type RankedPerson = {
  id: string;
  name: string;
  visits: number;
  commissionCents: number;
  referralCents: number;
  abatementCents: number;
  feeCents: number;
};

export function rankNet(person: RankedPerson) {
  return person.commissionCents + person.referralCents - person.abatementCents - person.feeCents;
}

export function rankStaff(rows: CommissionLine[], staffIds: Set<string> | null) {
  const map = new Map<string, RankedPerson>();
  for (const row of rows) {
    if (staffIds && !staffIds.has(row.personId)) continue;
    const current = map.get(row.personId) ?? {
      id: row.personId,
      name: row.personName,
      visits: 0,
      commissionCents: 0,
      referralCents: 0,
      abatementCents: 0,
      feeCents: 0,
    };
    if (row.origin === "indicacao") current.referralCents += row.commissionCents;
    else current.commissionCents += row.commissionCents;
    if (row.origin === "execucao") current.visits += 1;
    current.abatementCents += row.abatementCents;
    current.feeCents += row.feeCents;
    map.set(row.personId, current);
  }
  return [...map.values()].sort((a, b) => rankNet(b) - rankNet(a) || a.name.localeCompare(b.name, "pt-BR"));
}

export async function packageReport(accountId: string, start: string, end: string) {
  const sales = await db()<{ name: string; sales: number; soldCents: number; avulsoCents: number }[]>`
    SELECT cp.name, count(*)::int AS sales,
           COALESCE(SUM(cp.price_cents), 0)::int AS "soldCents",
           COALESCE(SUM(av.avulso), 0)::int AS "avulsoCents"
    FROM client_packages cp
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(s.price_cents), 0)::int AS avulso
      FROM package_credits cr
      JOIN services s ON s.id = cr.service_id
      WHERE cr.client_package_id = cp.id
    ) av ON true
    WHERE cp.account_id = ${accountId}
      AND cp.status <> 'cancelado'
      AND cp.sold_on >= ${start}::date
      AND cp.sold_on <= ${end}::date
    GROUP BY cp.name
    ORDER BY count(*) DESC, cp.name
  `;
  const services = await db()<{ name: string; visits: number; internalCents: number; avulsoCents: number }[]>`
    SELECT s.name, count(*)::int AS visits,
           COALESCE(SUM(cr.internal_price_cents), 0)::int AS "internalCents",
           COALESCE(SUM(s.price_cents), 0)::int AS "avulsoCents"
    FROM package_credits cr
    JOIN client_packages cp ON cp.id = cr.client_package_id
    JOIN services s ON s.id = cr.service_id
    WHERE cp.account_id = ${accountId}
      AND cp.status <> 'cancelado'
      AND cp.sold_on >= ${start}::date
      AND cp.sold_on <= ${end}::date
    GROUP BY s.name
    ORDER BY count(*) DESC, s.name
  `;
  const pardonRows = await db()<{ times: number; weeks: number; clients: number }[]>`
    SELECT count(*)::int AS times,
           COALESCE(SUM(weeks_lost), 0)::int AS weeks,
           COUNT(DISTINCT client_id)::int AS clients
    FROM package_pardons
    WHERE account_id = ${accountId}
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${start}::date
      AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${end}::date
  `;
  const repeats = await db()<{ clientId: string; clientName: string; times: number; weeks: number; sequence: number }[]>`
    SELECT c.id AS "clientId", c.name AS "clientName",
           count(*)::int AS times,
           COALESCE(SUM(p.weeks_lost), 0)::int AS weeks,
           MAX(p.sequence)::int AS sequence
    FROM package_pardons p
    JOIN clients c ON c.id = p.client_id
    WHERE p.account_id = ${accountId}
      AND (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${start}::date
      AND (p.created_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${end}::date
    GROUP BY c.id, c.name
    HAVING count(*) > 1 OR MAX(p.sequence) > 1
    ORDER BY count(*) DESC, c.name
  `;
  return {
    sales,
    services,
    pardons: pardonRows[0] ?? { times: 0, weeks: 0, clients: 0 },
    repeats,
  };
}

export type ServiceSplit = {
  id: string;
  name: string;
  vendaQty: number;
  vendaCents: number;
  usoQty: number;
  usoCents: number;
  avulsoQty: number;
  avulsoCents: number;
  courtesyQty: number;
};

export async function serviceSplit(accountId: string, start: string, end: string) {
  const [done, sold] = await Promise.all([
    db()<
      {
        id: string;
        name: string;
        usoQty: number;
        usoCents: number;
        avulsoQty: number;
        avulsoCents: number;
        courtesyQty: number;
      }[]
    >`
      SELECT s.id, s.name,
             count(*) FILTER (WHERE l.package_credit_id IS NOT NULL)::int AS "usoQty",
             COALESCE(SUM(cr.internal_price_cents) FILTER (WHERE l.package_credit_id IS NOT NULL), 0)::int AS "usoCents",
             count(*) FILTER (WHERE l.package_credit_id IS NULL)::int AS "avulsoQty",
             COALESCE(SUM(l.price_cents) FILTER (WHERE l.package_credit_id IS NULL), 0)::int AS "avulsoCents",
             count(*) FILTER (WHERE l.package_credit_id IS NULL AND l.courtesy)::int AS "courtesyQty"
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      JOIN services s ON s.id = l.service_id
      LEFT JOIN package_credits cr ON cr.id = l.package_credit_id
      WHERE l.account_id = ${accountId}
        AND l.kind = 'servico'
        AND o.kind = 'cliente'
        AND o.day >= ${start}::date
        AND o.day <= ${end}::date
        AND NOT EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.id = l.appointment_id AND a.status = 'cancelado'
        )
      GROUP BY s.id, s.name
    `,
    db()<{ id: string; name: string; vendaQty: number; vendaCents: number }[]>`
      SELECT s.id, s.name,
             count(*)::int AS "vendaQty",
             COALESCE(SUM(cr.internal_price_cents), 0)::int AS "vendaCents"
      FROM package_credits cr
      JOIN client_packages cp ON cp.id = cr.client_package_id
      JOIN services s ON s.id = cr.service_id
      WHERE cp.account_id = ${accountId}
        AND cp.status <> 'cancelado'
        AND cp.sold_on >= ${start}::date
        AND cp.sold_on <= ${end}::date
      GROUP BY s.id, s.name
    `,
  ]);
  const map = new Map<string, ServiceSplit>();
  const slot = (id: string, name: string): ServiceSplit => {
    const current = map.get(id) ?? {
      id,
      name,
      vendaQty: 0,
      vendaCents: 0,
      usoQty: 0,
      usoCents: 0,
      avulsoQty: 0,
      avulsoCents: 0,
      courtesyQty: 0,
    };
    map.set(id, current);
    return current;
  };
  for (const row of done) {
    const current = slot(row.id, row.name);
    current.usoQty = row.usoQty;
    current.usoCents = row.usoCents;
    current.avulsoQty = row.avulsoQty;
    current.avulsoCents = row.avulsoCents;
    current.courtesyQty = row.courtesyQty;
  }
  for (const row of sold) {
    const current = slot(row.id, row.name);
    current.vendaQty = row.vendaQty;
    current.vendaCents = row.vendaCents;
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

type ReturnVisit = {
  id: string;
  name: string;
  phone: string;
  fromOutside: boolean;
  serviceId: string;
  service: string;
  returnDays: number | null;
  day: string;
  prevDay: string | null;
  avulso: boolean;
  future: boolean;
};

type ReturnPack = {
  clientId: string;
  serviceId: string;
  status: string;
  createdAt: string;
  validUntil: string | null;
  lastUsed: string | null;
};

async function loadReturnFacts(accountId: string, clientId: string | null) {
  const [visits, packs] = await Promise.all([
    db()<ReturnVisit[]>`
      SELECT c.id, c.name, c.phone, c.from_outside AS "fromOutside",
             s.id AS "serviceId", s.name AS service, s.return_days AS "returnDays",
             to_char(ranked.day, 'YYYY-MM-DD') AS day,
             to_char(ranked.prev_day, 'YYYY-MM-DD') AS "prevDay",
             ranked.avulso,
             EXISTS (
               SELECT 1 FROM appointments next
               WHERE next.client_id = c.id
                 AND next.service_id = s.id
                 AND next.account_id = c.account_id
                 AND next.kind = 'horario'
                 AND next.status <> 'cancelado'
                 AND (next.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= (timezone('America/Sao_Paulo', now()))::date
             ) AS future
      FROM (
        SELECT a.client_id, a.service_id,
               (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
               COALESCE((
                 SELECT l.package_credit_id IS NULL
                 FROM order_lines l
                 WHERE l.appointment_id = a.id AND l.kind = 'servico'
                 ORDER BY l.created_at
                 LIMIT 1
               ), false) AS avulso,
               lag((a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date) OVER (
                 PARTITION BY a.client_id, a.service_id ORDER BY a.starts_at
               ) AS prev_day,
               row_number() OVER (
                 PARTITION BY a.client_id, a.service_id ORDER BY a.starts_at DESC
               ) AS n
        FROM appointments a
        WHERE a.account_id = ${accountId}
          AND a.kind = 'horario'
          AND a.status = 'realizado'
          AND a.service_id IS NOT NULL
          AND (${clientId}::uuid IS NULL OR a.client_id = ${clientId})
      ) ranked
      JOIN clients c ON c.id = ranked.client_id AND c.account_id = ${accountId}
      JOIN services s ON s.id = ranked.service_id
      WHERE ranked.n = 1
        AND (${clientId}::uuid IS NOT NULL OR c.active)
    `,
    db()<ReturnPack[]>`
      SELECT DISTINCT ON (cp.client_id, cr.service_id, cp.id)
             cp.client_id AS "clientId", cr.service_id AS "serviceId", cp.status,
             to_char(cp.created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
             to_char(cp.valid_until, 'YYYY-MM-DD') AS "validUntil",
             to_char((
               SELECT max(u.used_on) FROM package_credits u
               WHERE u.client_package_id = cp.id AND u.service_id = cr.service_id
             ), 'YYYY-MM-DD') AS "lastUsed"
      FROM client_packages cp
      JOIN package_credits cr ON cr.client_package_id = cp.id
      WHERE cp.account_id = ${accountId}
        AND cp.status <> 'cancelado'
        AND (${clientId}::uuid IS NULL OR cp.client_id = ${clientId})
      ORDER BY cp.client_id, cr.service_id, cp.id
    `,
  ]);
  return { visits, packs };
}

function factsFor(visit: ReturnVisit, packs: ReturnPack[], fromOutside: boolean): ReturnFacts {
  const mine = packs.filter((pack) => pack.clientId === visit.id && pack.serviceId === visit.serviceId);
  const active = mine.filter((pack) => pack.status === "ativo").sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
  const ended = mine.filter((pack) => pack.status === "concluido" || pack.status === "encerrado").sort((left, right) => (left.createdAt < right.createdAt ? 1 : -1));
  const latestActive = active[0];
  const latestEnded = ended[0];
  return {
    fromOutside,
    day: visit.day,
    prevDay: visit.prevDay,
    returnDays: visit.returnDays,
    avulso: visit.avulso,
    future: visit.future,
    activePackage: active.length > 0,
    renewed: Boolean(latestActive && ended.some((pack) => pack.createdAt < latestActive.createdAt)),
    packageEndedOn: active.length === 0 && latestEnded ? latestEnded.validUntil ?? latestEnded.lastUsed : null,
  };
}

function returnOnFor(facts: ReturnFacts, word: string) {
  if (facts.returnDays == null) return null;
  if (word === "no prazo" || word === "passou" || word === RETURN_WORD.voltou || word === RETURN_WORD.passou || word === RETURN_WORD.avulso) {
    return shiftDay(facts.day, facts.returnDays);
  }
  return null;
}

async function listedReturns(accountId: string, clientId: string, fromOutside: boolean, today: string) {
  const { visits, packs } = await loadReturnFacts(accountId, clientId);
  return visits.map((visit) => {
    const facts = factsFor(visit, packs, fromOutside);
    const outcome = classifyReturn(facts, today);
    let word = "sem volta";
    if (outcome) word = RETURN_WORD[outcome];
    else if (facts.activePackage) word = "pacote";
    else if (facts.returnDays != null) {
      const due = shiftDay(facts.day, facts.returnDays);
      word = today <= due ? "no prazo" : "passou";
    }
    return {
      serviceId: visit.serviceId,
      service: visit.service,
      day: visit.day,
      returnOn: returnOnFor(facts, word),
      word,
    };
  }).sort((left, right) => left.service.localeCompare(right.service, "pt"));
}

export async function returnRegister(accountId: string, today: string) {
  const { visits, packs } = await loadReturnFacts(accountId, null);
  return visits.flatMap((visit) => {
    const facts = factsFor(visit, packs, visit.fromOutside);
    const outcome = classifyReturn(facts, today);
    if (!outcome) return [];
    return [{
      id: visit.id,
      name: visit.name,
      phone: visit.phone,
      serviceId: visit.serviceId,
      service: visit.service,
      day: visit.day,
      outcome,
      word: RETURN_WORD[outcome],
    }];
  }).sort((left, right) => left.name.localeCompare(right.name, "pt") || left.service.localeCompare(right.service, "pt"));
}

export type CreditMove = { orderId: string; day: string; cents: number };

export async function clientLedger(accountId: string, clientId: string) {
  const [sources, uses] = await Promise.all([
    db()<CreditMove[]>`
      SELECT id AS "orderId", to_char(day, 'YYYY-MM-DD') AS day, (cash_paid - total)::int AS cents
      FROM (
        SELECT o.id, o.day,
               COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0) AS total,
               COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id AND pay.method <> 'conta'), 0) AS cash_paid
        FROM orders o
        WHERE o.account_id = ${accountId} AND o.client_id = ${clientId} AND o.kind = 'cliente'
      ) bills
      WHERE cash_paid > total
      ORDER BY day, id
    `,
    db()<CreditMove[]>`
      SELECT o.id AS "orderId", to_char(o.day, 'YYYY-MM-DD') AS day, pay.amount_cents AS cents
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      WHERE o.account_id = ${accountId} AND o.client_id = ${clientId} AND o.kind = 'cliente' AND pay.method = 'conta'
      ORDER BY o.day, pay.created_at
    `,
  ]);
  const surplus = sources.reduce((sum, row) => sum + row.cents, 0);
  const spent = uses.reduce((sum, row) => sum + row.cents, 0);
  return { creditCents: Math.max(0, surplus - spent), sources, uses };
}

export async function clientOtherDues(accountId: string, clientId: string, exceptOrderId: string) {
  return db()<{ id: string; day: string; gapCents: number }[]>`
    SELECT id, to_char(day, 'YYYY-MM-DD') AS day, (total - paid)::int AS "gapCents"
    FROM (
      SELECT o.id, o.day,
             COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0) AS total,
             COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0) AS paid
      FROM orders o
      WHERE o.account_id = ${accountId}
        AND o.client_id = ${clientId}
        AND o.kind = 'cliente'
        AND o.status = 'aberta'
        AND o.id <> ${exceptOrderId}
    ) bills
    WHERE total > paid
    ORDER BY day
  `;
}

export async function orderTrail(accountId: string, orderId: string) {
  return db()<{ id: string; kind: string; summary: string; at: string; actorName: string | null }[]>`
    SELECT e.id, e.kind, e.summary,
           to_char(e.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS at,
           u.name AS "actorName"
    FROM order_events e
    LEFT JOIN users u ON u.id = e.actor_id
    WHERE e.account_id = ${accountId} AND e.order_id = ${orderId}
    ORDER BY e.created_at DESC
    LIMIT 30
  `;
}

export async function clientCredit(accountId: string, clientId: string) {
  const ledger = await clientLedger(accountId, clientId);
  return ledger.creditCents;
}

export async function clientsWithCredit(accountId: string) {
  return db()<{ id: string; name: string; phone: string | null; creditCents: number }[]>`
    SELECT c.id, c.name, c.phone,
           GREATEST(
             0,
             COALESCE(SUM(GREATEST(b.cash_paid - b.total, 0)), 0) - COALESCE(SUM(b.conta_paid), 0)
           )::int AS "creditCents"
    FROM (
      SELECT o.client_id,
             COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0) AS total,
             COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id AND pay.method <> 'conta'), 0) AS cash_paid,
             COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id AND pay.method = 'conta'), 0) AS conta_paid
      FROM orders o
      WHERE o.account_id = ${accountId} AND o.kind = 'cliente' AND o.client_id IS NOT NULL
    ) b
    JOIN clients c ON c.id = b.client_id AND c.account_id = ${accountId}
    GROUP BY c.id, c.name, c.phone
    HAVING GREATEST(
      0,
      COALESCE(SUM(GREATEST(b.cash_paid - b.total, 0)), 0) - COALESCE(SUM(b.conta_paid), 0)
    ) > 0
    ORDER BY c.name
  `;
}

export async function clientBrief(accountId: string, clientId: string, fromOutside: boolean) {
  const today = todaySaoPaulo();
  const [lastRows, serviceRows, productRows, moneyRows, orders, agenda, notes, packages] = await Promise.all([
    db()<{
      day: string;
      time: string;
      service: string;
      returnDays: number | null;
      professional: string;
      orderId: string | null;
    }[]>`
      SELECT to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
             to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS time,
             COALESCE(s.name, 'Serviço') AS service,
             s.return_days AS "returnDays",
             pr.name AS professional,
             a.order_id AS "orderId"
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id
      JOIN professionals pr ON pr.id = a.professional_id
      WHERE a.account_id = ${accountId}
        AND a.client_id = ${clientId}
        AND a.status = 'realizado'
        AND a.kind = 'horario'
      ORDER BY a.starts_at DESC
      LIMIT 1
    `,
    db()<{ name: string; qty: number }[]>`
      SELECT s.name, count(*)::int AS qty
      FROM appointments a
      JOIN services s ON s.id = a.service_id
      WHERE a.account_id = ${accountId} AND a.client_id = ${clientId} AND a.status = 'realizado'
      GROUP BY s.name
      ORDER BY count(*) DESC, s.name
      LIMIT 1
    `,
    db()<{ name: string; qty: number }[]>`
      SELECT p.name, SUM(l.qty)::int AS qty
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      JOIN products p ON p.id = l.product_id
      WHERE o.account_id = ${accountId} AND o.client_id = ${clientId} AND l.kind = 'produto'
      GROUP BY p.name
      ORDER BY SUM(l.qty) DESC, p.name
      LIMIT 1
    `,
    db()<{ paidCents: number; spentCents: number; dueCents: number; creditCents: number; orderCount: number }[]>`
      SELECT COALESCE(SUM(paid), 0)::int AS "paidCents",
             COALESCE(SUM(cash_paid), 0)::int AS "spentCents",
             COALESCE(SUM(GREATEST(total - paid, 0)), 0)::int AS "dueCents",
             GREATEST(
               0,
               COALESCE(SUM(GREATEST(cash_paid - total, 0)), 0) - COALESCE(SUM(conta_paid), 0)
             )::int AS "creditCents",
             count(*)::int AS "orderCount"
      FROM (
        SELECT COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0) AS total,
               COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0) AS paid,
               COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id AND pay.method <> 'conta'), 0) AS cash_paid,
               COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id AND pay.method = 'conta'), 0) AS conta_paid
        FROM orders o
        WHERE o.account_id = ${accountId} AND o.client_id = ${clientId} AND o.kind = 'cliente'
      ) bills
    `,
    db()<{ id: string; day: string; status: string; totalCents: number; paidCents: number }[]>`
      SELECT o.id, to_char(o.day, 'YYYY-MM-DD') AS day, o.status,
             COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)::int AS "totalCents",
             COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)::int AS "paidCents"
      FROM orders o
      WHERE o.account_id = ${accountId} AND o.client_id = ${clientId} AND o.kind = 'cliente'
      ORDER BY o.day DESC, o.created_at DESC
      LIMIT 40
    `,
    db()<{
      id: string;
      orderId: string | null;
      status: string;
      day: string;
      time: string;
      service: string;
      professional: string;
    }[]>`
      SELECT a.id, a.order_id AS "orderId", a.status,
             to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
             to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS time,
             COALESCE(s.name, 'Horário') AS service,
             pr.name AS professional
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id
      JOIN professionals pr ON pr.id = a.professional_id
      WHERE a.account_id = ${accountId}
        AND a.client_id = ${clientId}
        AND a.kind = 'horario'
        AND a.status <> 'cancelado'
      ORDER BY a.starts_at DESC
      LIMIT 20
    `,
    db()<{
      id: string;
      orderId: string | null;
      day: string;
      time: string;
      service: string;
      body: string;
      at: string;
      author: string;
    }[]>`
      SELECT n.id, a.order_id AS "orderId",
             to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
             to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS time,
             COALESCE(s.name, 'Horário') AS service,
             n.body,
             to_char(n.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS at,
             COALESCE(u.name, 'Balcão') AS author
      FROM visit_notes n
      JOIN appointments a ON a.id = n.appointment_id
      LEFT JOIN services s ON s.id = a.service_id
      LEFT JOIN users u ON u.id = n.created_by
      WHERE n.account_id = ${accountId} AND a.client_id = ${clientId}
      ORDER BY n.created_at DESC
      LIMIT 40
    `,
    clientPackages(accountId, clientId, today),
  ]);
  const last = lastRows[0] ?? null;
  const returns = await listedReturns(accountId, clientId, fromOutside, today);
  return {
    last,
    topService: serviceRows[0] ?? null,
    topProduct: productRows[0] ?? null,
    money: moneyRows[0] ?? { paidCents: 0, spentCents: 0, dueCents: 0, creditCents: 0, orderCount: 0 },
    orders,
    agenda,
    notes,
    packages,
    returns,
  };
}
