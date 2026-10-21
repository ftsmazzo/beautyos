"use server";

import { randomUUID } from "crypto";
import type { TransactionSql } from "postgres";
import { requireDesk, requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { checked, digits, formatDay, formatReais, parseIntField, parsePercent, parseReais, staffPriceCents, todaySaoPaulo } from "@/catalog/format";
import { CHANNELS, FORM_ERRORS } from "@/catalog/labels";
import { settle } from "@/catalog/settle";
import { db } from "@/db/client";
import { cardFeeShares } from "@/desk/card-fee";
import { restampOrder, stampReferral } from "@/desk/referral";
import { addMinutes, dayParam, firstWeekdayAfter, minutes, periodsFor, placementIssue, shiftDay, stamp } from "@/desk/clock";
import { chargedServicePrice } from "@/desk/pricing";
import { linkedProfessional } from "@/desk/queries";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CHANNEL_VALUES = new Set<string>(CHANNELS.map((item) => item.value));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ["agendado", "confirmado", "chegou", "em_atendimento", "realizado", "ausente", "cancelado"];

function idOrNull(value: string) {
  return UUID.test(value) ? value : null;
}

async function scope(userId: string, role: string) {
  if (role !== "profissional") return null;
  const id = await linkedProfessional(userId);
  if (!id) throw new FormError("login");
  return id;
}

export async function bookSlot(formData: FormData) {
  const user = await requireDesk();
  const day = dayParam(String(formData.get("day") ?? ""));
  return settle(`/agenda?dia=${day}`, async () => {
    const { bookAppointment } = await import("@/desk/booking");
    const own = await scope(user.id, user.role);
    const professionalId = own ?? idOrNull(String(formData.get("professional") ?? ""));
    const serviceId = idOrNull(String(formData.get("service") ?? ""));
    const clientId = idOrNull(String(formData.get("client") ?? ""));
    const start = String(formData.get("start") ?? "");
    const encaixe = formData.get("encaixe") === "1";
    if (!professionalId || !serviceId) throw new FormError("dados");
    if (!TIME.test(start)) throw new FormError("hora");
    if (!clientId) {
      const incomplete = await db().begin(async (tx) => {
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
          JOIN professionals p ON p.id = ${professionalId} AND p.account_id = ${user.accountId} AND p.active
          WHERE s.id = ${serviceId} AND s.account_id = ${user.accountId} AND s.active
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
        const orderId = randomUUID();
        await tx`
          INSERT INTO orders (id, account_id, day, kind, status, incomplete)
          VALUES (${orderId}, ${user.accountId}, ${day}, 'cliente', 'aberta', true)
        `;
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
            ${appointmentId}, ${user.accountId}, ${professionalId}, null, ${serviceId}, ${orderId},
            ${startsAt}, ${endsAt}, 'agendado', ${encaixe}, 'horario'
          )
        `;
        await tx`
          INSERT INTO order_lines (
            id, account_id, order_id, appointment_id, kind, service_id, professional_id,
            description, qty, price_cents, list_price_cents, commission_percent, commission_cents
          ) VALUES (
            ${lineId}, ${user.accountId}, ${orderId}, ${appointmentId}, 'servico', ${serviceId}, ${professionalId},
            ${offer[0].name}, 1, ${price}, ${sheet}, ${offer[0].commissionPercent}, ${commission}
          )
        `;
        return orderId;
      });
      return `/comandas/${incomplete}`;
    }
    const booked = await bookAppointment({
      accountId: user.accountId,
      actorId: user.id,
      professionalId,
      serviceId,
      clientId,
      day,
      start,
      encaixe,
    });
    return `/comandas/${booked.orderId}`;
  });
}

export async function blockSlot(formData: FormData) {
  const user = await requireDesk();
  const day = dayParam(String(formData.get("day") ?? ""));
  return settle(`/agenda?dia=${day}`, async () => {
    const own = await scope(user.id, user.role);
    const professionalId = own ?? idOrNull(String(formData.get("professional") ?? ""));
    const start = String(formData.get("start") ?? "");
    const end = String(formData.get("end") ?? "");
    if (!professionalId) throw new FormError("dados");
    if (!TIME.test(start) || !TIME.test(end) || end <= start) throw new FormError("hora");
    const owned = await db()`SELECT id FROM professionals WHERE id = ${professionalId} AND account_id = ${user.accountId}`;
    if (!owned.length) throw new FormError("dados");
    await db()`
      INSERT INTO appointments (
        id, account_id, professional_id, starts_at, ends_at, status, encaixe, kind
      ) VALUES (
        ${randomUUID()}, ${user.accountId}, ${professionalId}, ${stamp(day, start)}, ${stamp(day, end)},
        'bloqueado', false, 'bloqueio'
      )
    `;
    return `/agenda?dia=${day}`;
  });
}

export async function removeBlock(formData: FormData) {
  const user = await requireDesk();
  const day = dayParam(String(formData.get("day") ?? ""));
  const id = idOrNull(String(formData.get("id") ?? ""));
  const own = await scope(user.id, user.role);
  if (!id) {
    const { redirect } = await import("next/navigation");
    redirect(`/agenda?dia=${day}`);
  }
  await db()`
    DELETE FROM appointments
    WHERE id = ${id} AND account_id = ${user.accountId} AND kind = 'bloqueio'
      AND (${own}::uuid IS NULL OR professional_id = ${own})
  `;
  const { redirect } = await import("next/navigation");
  redirect(`/agenda?dia=${day}`);
}

export async function setStatus(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  const appointmentId = String(formData.get("appointment") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status)) throw new FormError("dados");
  if (status === "cancelado") {
    const open = await db()<{ status: string }[]>`
      SELECT status FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
    `;
    if (open[0]?.status === "fechada") {
      const { redirect } = await import("next/navigation");
      redirect(`/comandas/${orderId}?erro=fechada`);
    }
    const slot = await db()<{ day: string; serviceId: string | null; professionalId: string }[]>`
      SELECT to_char(starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
             service_id AS "serviceId", professional_id AS "professionalId"
      FROM appointments
      WHERE id = ${appointmentId} AND account_id = ${user.accountId}
    `;
    await db().begin(async (tx) => {
      await logCancellation(tx, user.id, user.accountId, appointmentId);
      await releasePackageVisits(tx, user.accountId, appointmentId);
      await tx`
        UPDATE appointments SET status = 'cancelado'
        WHERE id = ${appointmentId} AND account_id = ${user.accountId}
      `;
      await applyServiceUse(tx, user.accountId, appointmentId, user.id);
      await tx`DELETE FROM order_lines WHERE appointment_id = ${appointmentId} AND account_id = ${user.accountId}`;
    });
    if (slot[0]) {
      const { promoteWaitlistOnCancel } = await import("@/agent/waitlist");
      await promoteWaitlistOnCancel(user.accountId, {
        day: slot[0].day,
        serviceId: slot[0].serviceId,
        professionalId: slot[0].professionalId,
      });
    }
  } else {
    await db().begin(async (tx) => {
      await markAttendance(tx, user.accountId, appointmentId, status);
      if (status === "realizado") await finishPackageVisit(tx, user.accountId, appointmentId);
      await applyServiceUse(tx, user.accountId, appointmentId, user.id);
    });
  }
  const { redirect } = await import("next/navigation");
  redirect(`/comandas/${orderId}`);
}

export async function addProduct(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    let productId = String(formData.get("product") ?? "");
    const barcode = String(formData.get("barcode") ?? "").trim();
    const qty = parseIntField(formData.get("qty")) ?? 1;
    const professionalId = String(formData.get("professional") ?? "") || null;
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string }[]>`
        SELECT status, kind FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta" || order[0].kind !== "cliente") throw new FormError("fechada");
      if (!productId && barcode) {
        const found = await tx<{ id: string }[]>`
          SELECT id FROM products
          WHERE account_id = ${user.accountId} AND barcode = ${barcode} AND active AND sells_to_client
        `;
        if (!found[0]) throw new FormError("barra");
        productId = found[0].id;
      }
      if (!productId) throw new FormError("dados");
      const product = await tx<{ name: string; priceCents: number; commissionPercent: number }[]>`
        SELECT p.name, p.sale_price_cents AS "priceCents",
               COALESCE(pp.commission_percent, p.commission_percent) AS "commissionPercent"
        FROM products p
        LEFT JOIN professional_products pp
          ON pp.product_id = p.id AND pp.professional_id = ${professionalId}
        WHERE p.id = ${productId} AND p.account_id = ${user.accountId} AND p.sells_to_client
      `;
      if (!product[0] || qty < 1) throw new FormError("estoque");
      const price = product[0].priceCents * qty;
      const commission = Math.round(price * product[0].commissionPercent / 100);
      const lineId = randomUUID();
      await tx`
        INSERT INTO order_lines (
          id, account_id, order_id, kind, product_id, professional_id, description, qty,
          price_cents, list_price_cents, commission_percent, commission_cents
        ) VALUES (
          ${lineId}, ${user.accountId}, ${orderId}, 'produto', ${productId}, ${professionalId},
          ${product[0].name}, ${qty}, ${price}, ${price}, ${product[0].commissionPercent}, ${commission}
        )
      `;
      await stampReferral(tx, user.accountId, orderId, lineId, price);
      const parts = await tx<{ componentId: string; qty: number }[]>`
        SELECT component_id AS "componentId", qty
        FROM product_components
        WHERE product_id = ${productId}
      `;
      const leaving = parts.length
        ? parts.map((part) => ({ productId: part.componentId, qty: part.qty * qty }))
        : [{ productId, qty }];
      for (const item of leaving) {
        await tx`
          INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by, line_id)
          VALUES (
            ${randomUUID()}, ${user.accountId}, ${item.productId}, ${-item.qty}, 'venda', ${"comanda"}, ${user.id}, ${lineId}
          )
        `;
      }
    });
    return `/comandas/${orderId}`;
  });
}

export async function sellPackage(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const packageId = idOrNull(String(formData.get("package") ?? ""));
    const sellerId = idOrNull(String(formData.get("seller") ?? ""));
    if (!packageId) throw new FormError("dados");
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string; clientId: string | null; day: string }[]>`
        SELECT status, kind, client_id AS "clientId", to_char(day, 'YYYY-MM-DD') AS day
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta" || order[0].kind !== "cliente") throw new FormError("fechada");
      if (!order[0].clientId) throw new FormError("cliente");
      await recordPackageSale(tx, {
        accountId: user.accountId,
        actorId: user.id,
        orderId,
        clientId: order[0].clientId,
        day: order[0].day,
        packageId,
        sellerId,
      });
    });
    return `/comandas/${orderId}`;
  });
}

export async function sellPackageOnDay(formData: FormData) {
  const user = await requireOperator();
  return settle("/pacotes/vendidos", async () => {
    const clientId = idOrNull(String(formData.get("client") ?? ""));
    const packageId = idOrNull(String(formData.get("package") ?? ""));
    const sellerId = idOrNull(String(formData.get("seller") ?? ""));
    if (!clientId || !packageId) throw new FormError("dados");
    const day = todaySaoPaulo();
    const orderId = await db().begin(async (tx) => {
      const client = await tx`SELECT id FROM clients WHERE id = ${clientId} AND account_id = ${user.accountId} AND active`;
      if (!client.length) throw new FormError("cliente");
      const existing = await tx<{ id: string; status: string }[]>`
        SELECT id, status FROM orders
        WHERE account_id = ${user.accountId} AND client_id = ${clientId} AND day = ${day} AND kind = 'cliente'
      `;
      if (existing[0]?.status === "fechada") throw new FormError("fechada");
      const nextId = existing[0]?.id ?? randomUUID();
      if (!existing[0]) {
        await tx`
          INSERT INTO orders (id, account_id, client_id, day, kind, status)
          VALUES (${nextId}, ${user.accountId}, ${clientId}, ${day}, 'cliente', 'aberta')
        `;
      }
      await recordPackageSale(tx, {
        accountId: user.accountId,
        actorId: user.id,
        orderId: nextId,
        clientId,
        day,
        packageId,
        sellerId,
      });
      return nextId;
    });
    return `/comandas/${orderId}`;
  });
}

async function recordPackageSale(
  tx: TransactionSql,
  input: {
    accountId: string;
    actorId: string;
    orderId: string;
    clientId: string;
    day: string;
    packageId: string;
    sellerId: string | null;
  },
) {
      const pack = await tx<{
        name: string;
        validityDays: number;
        saleCommissionPercent: number | null;
        priceCents: number;
      }[]>`
        SELECT name, validity_days AS "validityDays", sale_commission_percent AS "saleCommissionPercent",
               price_cents AS "priceCents"
        FROM packages
        WHERE id = ${input.packageId} AND account_id = ${input.accountId} AND for_sale
      `;
      if (!pack[0]) throw new FormError("fora");
      const items = await tx<{
        kind: string;
        serviceId: string | null;
        productId: string | null;
        qty: number;
        internalPriceCents: number;
        position: number;
      }[]>`
        SELECT kind, service_id AS "serviceId", product_id AS "productId", qty,
               internal_price_cents AS "internalPriceCents", position
        FROM package_items
        WHERE package_id = ${input.packageId}
        ORDER BY position
      `;
      const visits = items.filter((item) => item.kind === "service" && item.serviceId);
      if (!visits.length) throw new FormError("soma");
      let salePercent = 0;
      let saleCommission = 0;
      let seller: string | null = null;
      if (pack[0].saleCommissionPercent != null && input.sellerId) {
        const person = await tx`SELECT id FROM professionals WHERE id = ${input.sellerId} AND account_id = ${input.accountId} AND active`;
        if (!person.length) throw new FormError("dados");
        salePercent = pack[0].saleCommissionPercent;
        saleCommission = Math.round(pack[0].priceCents * salePercent / 100);
        seller = input.sellerId;
      }
      const heldId = randomUUID();
      const lineId = randomUUID();
      await tx`
        INSERT INTO client_packages (
          id, account_id, client_id, package_id, order_id, order_line_id, name,
          validity_days, sale_commission_percent, price_cents, sold_on, status
        ) VALUES (
          ${heldId}, ${input.accountId}, ${input.clientId}, ${input.packageId}, ${input.orderId}, ${lineId}, ${pack[0].name},
          ${pack[0].validityDays}, ${pack[0].saleCommissionPercent}, ${pack[0].priceCents}, ${input.day}::date, 'ativo'
        )
      `;
      for (const visit of visits) {
        await tx`
          INSERT INTO package_credits (
            id, account_id, client_package_id, service_id, position, internal_price_cents, status
          ) VALUES (
            ${randomUUID()}, ${input.accountId}, ${heldId}, ${visit.serviceId}, ${visit.position},
            ${visit.internalPriceCents}, 'falta_agendar'
          )
        `;
      }
      for (const item of items) {
        if (item.kind !== "product" || !item.productId) continue;
        await tx`
          INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by)
          VALUES (
            ${randomUUID()}, ${input.accountId}, ${item.productId}, ${-item.qty}, 'venda',
            ${"venda de pacote"}, ${input.actorId}
          )
        `;
      }
      await tx`
        INSERT INTO order_lines (
          id, account_id, order_id, kind, professional_id, description, qty,
          price_cents, list_price_cents, commission_percent, commission_cents
        ) VALUES (
          ${lineId}, ${input.accountId}, ${input.orderId}, 'pacote', ${seller}, ${pack[0].name}, 1,
          ${pack[0].priceCents}, ${pack[0].priceCents}, ${salePercent}, ${saleCommission}
        )
      `;
      await stampReferral(tx, input.accountId, input.orderId, lineId, pack[0].priceCents);
      const serviceIds = [...new Set(visits.map((visit) => visit.serviceId as string))];
      for (const serviceId of serviceIds) {
        const matches = await tx<{ id: string }[]>`
          SELECT id FROM order_lines
          WHERE order_id = ${input.orderId} AND kind = 'servico' AND service_id = ${serviceId}
            AND package_credit_id IS NULL AND courtesy = false
          ORDER BY created_at
        `;
        for (const match of matches) {
          const taken = await takePackageCredit(tx, {
            accountId: input.accountId,
            actorId: input.actorId,
            orderId: input.orderId,
            clientId: input.clientId,
            day: input.day,
            lineId: match.id,
          });
          if (!taken) break;
        }
      }
      await writeEvent(tx, {
        accountId: input.accountId,
        orderId: input.orderId,
        lineId,
        appointmentId: null,
        actorId: input.actorId,
        kind: "valor",
        summary: `Vendeu ${pack[0].name} por ${formatReais(pack[0].priceCents)}. Comissão de venda ${formatReais(saleCommission)}.`,
        beforeCents: null,
        afterCents: pack[0].priceCents,
      });
}

export async function applyPackageUse(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  const lineId = idOrNull(String(formData.get("line") ?? ""));
  return settle(`/comandas/${orderId}`, async () => {
    if (!lineId) throw new FormError("dados");
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string; clientId: string | null; day: string }[]>`
        SELECT status, kind, client_id AS "clientId", to_char(day, 'YYYY-MM-DD') AS day
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta" || order[0].kind !== "cliente") throw new FormError("fechada");
      if (!order[0].clientId) throw new FormError("cliente");
      const taken = await takePackageCredit(tx, {
        accountId: user.accountId,
        actorId: user.id,
        orderId,
        clientId: order[0].clientId,
        day: order[0].day,
        lineId,
      });
      if (!taken) throw new FormError("credito");
    });
    return `/comandas/${orderId}`;
  });
}

async function releasePackageVisits(tx: TransactionSql, accountId: string, appointmentId: string) {
  const lines = await tx<{ packageCreditId: string }[]>`
    SELECT package_credit_id AS "packageCreditId"
    FROM order_lines
    WHERE appointment_id = ${appointmentId} AND account_id = ${accountId} AND package_credit_id IS NOT NULL
  `;
  for (const line of lines) {
    const credit = await tx<{ clientPackageId: string }[]>`
      SELECT client_package_id AS "clientPackageId" FROM package_credits WHERE id = ${line.packageCreditId}
    `;
    await tx`
      UPDATE package_credits
      SET status = 'falta_agendar', order_line_id = NULL, appointment_id = NULL, used_on = NULL
      WHERE id = ${line.packageCreditId}
    `;
    if (!credit[0]) continue;
    const still = await tx`SELECT 1 FROM package_credits WHERE client_package_id = ${credit[0].clientPackageId} AND status = 'usado'`;
    if (!still.length) {
      await tx`
        UPDATE client_packages
        SET status = 'ativo', first_used_on = NULL, valid_until = NULL
        WHERE id = ${credit[0].clientPackageId}
      `;
    } else {
      await tx`UPDATE client_packages SET status = 'ativo' WHERE id = ${credit[0].clientPackageId}`;
    }
  }
  const parked = await tx<{ clientPackageId: string }[]>`
    SELECT client_package_id AS "clientPackageId"
    FROM package_credits
    WHERE account_id = ${accountId} AND appointment_id = ${appointmentId} AND status <> 'usado'
  `;
  if (parked.length) {
    await tx`
      UPDATE package_credits
      SET status = 'falta_agendar', order_line_id = NULL, appointment_id = NULL, used_on = NULL
      WHERE account_id = ${accountId} AND appointment_id = ${appointmentId} AND status <> 'usado'
    `;
  }
  for (const credit of parked) {
    const still = await tx`SELECT 1 FROM package_credits WHERE client_package_id = ${credit.clientPackageId} AND status = 'usado'`;
    if (!still.length) {
      await tx`
        UPDATE client_packages
        SET status = 'ativo', first_used_on = NULL, valid_until = NULL
        WHERE id = ${credit.clientPackageId}
      `;
    } else {
      await tx`UPDATE client_packages SET status = 'ativo' WHERE id = ${credit.clientPackageId}`;
    }
  }
}

async function applyServiceUse(tx: TransactionSql, accountId: string, appointmentId: string, actorId: string) {
  const rows = await tx<{ status: string; serviceId: string | null }[]>`
    SELECT a.status, l.service_id AS "serviceId"
    FROM appointments a
    LEFT JOIN order_lines l ON l.appointment_id = a.id
    WHERE a.id = ${appointmentId} AND a.account_id = ${accountId}
  `;
  const supplies = rows[0]?.status === "realizado" && rows[0].serviceId
    ? await tx<{ productId: string; qty: number }[]>`
        SELECT product_id AS "productId", qty
        FROM service_supplies
        WHERE service_id = ${rows[0].serviceId}
      `
    : [];
  const wanted = new Map(supplies.map((supply) => [supply.productId, -supply.qty]));
  const current = await tx<{ productId: string; qty: number }[]>`
    SELECT product_id AS "productId", COALESCE(SUM(qty), 0)::int AS qty
    FROM stock_movements
    WHERE appointment_id = ${appointmentId} AND account_id = ${accountId} AND reason = 'uso'
    GROUP BY product_id
  `;
  const seen = new Set(current.map((row) => row.productId));
  for (const row of current) {
    const delta = (wanted.get(row.productId) ?? 0) - row.qty;
    if (delta === 0) continue;
    await tx`
      INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by, appointment_id)
      VALUES (
        ${randomUUID()}, ${accountId}, ${row.productId}, ${delta}, 'uso',
        ${delta < 0 ? "uso no serviço" : "estorno do serviço"}, ${actorId}, ${appointmentId}
      )
    `;
  }
  for (const [productId, qty] of wanted) {
    if (seen.has(productId) || qty === 0) continue;
    await tx`
      INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by, appointment_id)
      VALUES (
        ${randomUUID()}, ${accountId}, ${productId}, ${qty}, 'uso', ${"uso no serviço"}, ${actorId}, ${appointmentId}
      )
    `;
  }
}

async function finishPackageVisit(tx: TransactionSql, accountId: string, appointmentId: string) {
  const lines = await tx<{ packageCreditId: string; day: string }[]>`
    SELECT l.package_credit_id AS "packageCreditId", to_char(o.day, 'YYYY-MM-DD') AS day
    FROM order_lines l
    JOIN orders o ON o.id = l.order_id
    WHERE l.appointment_id = ${appointmentId} AND l.account_id = ${accountId} AND l.package_credit_id IS NOT NULL
  `;
  for (const line of lines) {
    const credit = await tx<{ clientPackageId: string; status: string; started: boolean; validityDays: number }[]>`
      SELECT c.client_package_id AS "clientPackageId", c.status, cp.first_used_on IS NOT NULL AS started,
             cp.validity_days AS "validityDays"
      FROM package_credits c
      JOIN client_packages cp ON cp.id = c.client_package_id
      WHERE c.id = ${line.packageCreditId} AND c.account_id = ${accountId}
    `;
    if (credit[0]?.status !== "agendado") continue;
    await tx`
      UPDATE package_credits
      SET status = 'usado', used_on = ${line.day}::date
      WHERE id = ${line.packageCreditId}
    `;
    if (!credit[0].started) {
      await tx`
        UPDATE client_packages
        SET first_used_on = ${line.day}::date,
            valid_until = ${shiftDay(line.day, credit[0].validityDays)}::date
        WHERE id = ${credit[0].clientPackageId} AND first_used_on IS NULL
      `;
    }
    const left = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM package_credits
      WHERE client_package_id = ${credit[0].clientPackageId} AND status <> 'usado'
    `;
    if ((left[0]?.n ?? 0) === 0) {
      await tx`UPDATE client_packages SET status = 'concluido' WHERE id = ${credit[0].clientPackageId}`;
    }
  }
}

async function placePackageCredit(
  tx: TransactionSql,
  input: {
    accountId: string;
    actorId: string;
    creditId: string;
    professionalId: string;
    day: string;
    start: string;
    consume?: boolean;
    summary?: string;
  },
) {
  const credit = await tx<{
    serviceId: string;
    serviceName: string;
    internalPriceCents: number;
    clientId: string;
    clientPackageId: string;
    validityDays: number;
    started: boolean;
    validUntil: string | null;
  }[]>`
    SELECT c.service_id AS "serviceId", s.name AS "serviceName",
           c.internal_price_cents AS "internalPriceCents", cp.client_id AS "clientId",
           cp.id AS "clientPackageId", cp.validity_days AS "validityDays",
           cp.first_used_on IS NOT NULL AS started,
           to_char(cp.valid_until, 'YYYY-MM-DD') AS "validUntil"
    FROM package_credits c
    JOIN client_packages cp ON cp.id = c.client_package_id
    JOIN services s ON s.id = c.service_id
    WHERE c.id = ${input.creditId} AND c.account_id = ${input.accountId}
      AND c.status = 'falta_agendar' AND cp.status = 'ativo'
  `;
  if (!credit[0]) return { ok: false as const, code: "credito" };
  if (input.consume && credit[0].validUntil && credit[0].validUntil < input.day) {
    return { ok: false as const, code: "vencido" };
  }
  const offer = await tx<{ durationMin: number; commissionPercent: number; priceCents: number }[]>`
    SELECT COALESCE(ps.duration_min, s.duration_min) AS "durationMin",
           COALESCE(ps.commission_percent, s.commission_percent) AS "commissionPercent",
           COALESCE(ps.price_cents, s.price_cents) AS "priceCents"
    FROM services s
    JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = ${input.professionalId}
    WHERE s.id = ${credit[0].serviceId} AND s.account_id = ${input.accountId} AND s.active
  `;
  if (!offer[0]) return { ok: false as const, code: "servico" };
  const end = addMinutes(input.start, offer[0].durationMin);
  if (minutes(end) >= 24 * 60) return { ok: false as const, code: "hora" };
  const startsAt = stamp(input.day, input.start);
  const endsAt = stamp(input.day, end);
  const hours = await tx<{ weekday: number; period: number; startTime: string; endTime: string; validFrom: string | null; validUntil: string | null }[]>`
    SELECT weekday, period, start_time AS "startTime", end_time AS "endTime",
           to_char(valid_from, 'YYYY-MM-DD') AS "validFrom",
           to_char(valid_until, 'YYYY-MM-DD') AS "validUntil"
    FROM professional_hours WHERE professional_id = ${input.professionalId}
  `;
  const issue = placementIssue(periodsFor(hours, input.day), input.start, end);
  if (issue) return { ok: false as const, code: issue };
  const clash = await tx`
    SELECT id FROM appointments
    WHERE professional_id = ${input.professionalId}
      AND status <> 'cancelado'
      AND starts_at < ${endsAt}
      AND ends_at > ${startsAt}
  `;
  if (clash.length) return { ok: false as const, code: "ocupado" };
  const future = !input.consume && input.day > todaySaoPaulo();
  if (future) {
    const appointmentId = randomUUID();
    await tx`
      INSERT INTO appointments (
        id, account_id, professional_id, client_id, service_id,
        starts_at, ends_at, status, encaixe, kind
      ) VALUES (
        ${appointmentId}, ${input.accountId}, ${input.professionalId}, ${credit[0].clientId}, ${credit[0].serviceId},
        ${startsAt}, ${endsAt}, 'agendado', false, 'horario'
      )
    `;
    await tx`
      UPDATE package_credits
      SET status = 'agendado', appointment_id = ${appointmentId}, order_line_id = NULL, used_on = NULL
      WHERE id = ${input.creditId}
    `;
    return { ok: true as const, day: input.day, end, serviceName: credit[0].serviceName, orderId: null, appointmentId };
  }
  const existing = await tx<{ id: string; status: string }[]>`
    SELECT id, status FROM orders
    WHERE account_id = ${input.accountId} AND client_id = ${credit[0].clientId}
      AND day = ${input.day}::date AND kind = 'cliente'
  `;
  if (existing[0]?.status === "fechada") return { ok: false as const, code: "fechada" };
  const targetId = existing[0]?.id ?? randomUUID();
  if (!existing[0]) {
    await tx`
      INSERT INTO orders (id, account_id, client_id, day, kind, status)
      VALUES (${targetId}, ${input.accountId}, ${credit[0].clientId}, ${input.day}::date, 'cliente', 'aberta')
    `;
  }
  const appointmentId = randomUUID();
  const lineId = randomUUID();
  const commission = Math.round(credit[0].internalPriceCents * offer[0].commissionPercent / 100);
  await tx`
    INSERT INTO appointments (
      id, account_id, professional_id, client_id, service_id, order_id,
      starts_at, ends_at, status, encaixe, kind
    ) VALUES (
      ${appointmentId}, ${input.accountId}, ${input.professionalId}, ${credit[0].clientId}, ${credit[0].serviceId}, ${targetId},
      ${startsAt}, ${endsAt}, ${input.consume ? "realizado" : "agendado"}, false, 'horario'
    )
  `;
  await tx`
    INSERT INTO order_lines (
      id, account_id, order_id, appointment_id, kind, service_id, professional_id,
      description, qty, price_cents, list_price_cents, commission_percent, commission_cents, package_credit_id
    ) VALUES (
      ${lineId}, ${input.accountId}, ${targetId}, ${appointmentId}, 'servico', ${credit[0].serviceId}, ${input.professionalId},
      ${credit[0].serviceName}, 1, 0, ${offer[0].priceCents}, ${offer[0].commissionPercent}, ${commission}, ${input.creditId}
    )
  `;
  await stampReferral(tx, input.accountId, targetId, lineId, credit[0].internalPriceCents);
  await applyServiceUse(tx, input.accountId, appointmentId, input.actorId);
  if (input.consume) {
    await tx`
      UPDATE package_credits
      SET status = 'usado', order_line_id = ${lineId}, appointment_id = ${appointmentId}, used_on = ${input.day}::date
      WHERE id = ${input.creditId}
    `;
    if (!credit[0].started) {
      await tx`
        UPDATE client_packages
        SET first_used_on = ${input.day}::date,
            valid_until = ${shiftDay(input.day, credit[0].validityDays)}::date
        WHERE id = ${credit[0].clientPackageId} AND first_used_on IS NULL
      `;
    }
    const left = await tx<{ n: number }[]>`
      SELECT count(*)::int AS n FROM package_credits
      WHERE client_package_id = ${credit[0].clientPackageId} AND status <> 'usado'
    `;
    if ((left[0]?.n ?? 0) === 0) {
      await tx`UPDATE client_packages SET status = 'concluido' WHERE id = ${credit[0].clientPackageId}`;
    }
  } else {
    await tx`
      UPDATE package_credits
      SET status = 'agendado', order_line_id = ${lineId}, appointment_id = ${appointmentId}, used_on = NULL
      WHERE id = ${input.creditId}
    `;
  }
  await writeEvent(tx, {
    accountId: input.accountId,
    orderId: targetId,
    lineId,
    appointmentId,
    actorId: input.actorId,
    kind: "valor",
    summary: input.summary ?? (input.consume
      ? `Usou agora ${credit[0].serviceName} do pacote. Cobrança zerada. Comissão ${formatReais(commission)} sobre o interno ${formatReais(credit[0].internalPriceCents)}.`
      : `Marcou ${credit[0].serviceName} do pacote em ${formatDay(input.day)} ${input.start}–${end}. Cobrança zerada. Comissão ${formatReais(commission)} sobre o interno ${formatReais(credit[0].internalPriceCents)}.`),
    beforeCents: offer[0].priceCents,
    afterCents: 0,
  });
  return { ok: true as const, day: input.day, end, serviceName: credit[0].serviceName, orderId: targetId, appointmentId };
}

const SKIP_SLOT = new Set(["ocupado", "fechada", "fechado", "almoco"]);

export async function openDuePackageVisits(accountId: string, actorId: string, day: string) {
  if (day > todaySaoPaulo()) return;
  await db().begin(async (tx) => {
    const due = await tx<{
      creditId: string;
      appointmentId: string;
      clientId: string | null;
      serviceName: string;
      professionalId: string;
      internalPriceCents: number;
      serviceId: string;
    }[]>`
      SELECT c.id AS "creditId", c.appointment_id AS "appointmentId",
             a.client_id AS "clientId", s.name AS "serviceName",
             a.professional_id AS "professionalId", c.internal_price_cents AS "internalPriceCents",
             c.service_id AS "serviceId"
      FROM package_credits c
      JOIN appointments a ON a.id = c.appointment_id
      JOIN services s ON s.id = c.service_id
      WHERE c.account_id = ${accountId}
        AND c.status = 'agendado'
        AND c.order_line_id IS NULL
        AND a.status <> 'cancelado'
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date = ${day}::date
      FOR UPDATE OF c
    `;
    for (const row of due) {
      if (!row.clientId) continue;
      const existing = await tx<{ id: string; status: string }[]>`
        SELECT id, status FROM orders
        WHERE account_id = ${accountId} AND client_id = ${row.clientId}
          AND day = ${day}::date AND kind = 'cliente'
      `;
      if (existing[0]?.status === "fechada") continue;
      const orderId = existing[0]?.id ?? randomUUID();
      if (!existing[0]) {
        await tx`
          INSERT INTO orders (id, account_id, client_id, day, kind, status)
          VALUES (${orderId}, ${accountId}, ${row.clientId}, ${day}::date, 'cliente', 'aberta')
        `;
      }
      const offer = await tx<{ priceCents: number; commissionPercent: number }[]>`
        SELECT COALESCE(ps.price_cents, s.price_cents) AS "priceCents",
               COALESCE(ps.commission_percent, s.commission_percent) AS "commissionPercent"
        FROM services s
        LEFT JOIN professional_services ps
          ON ps.service_id = s.id AND ps.professional_id = ${row.professionalId}
        WHERE s.id = ${row.serviceId} AND s.account_id = ${accountId}
      `;
      const percent = offer[0]?.commissionPercent ?? 0;
      const sheet = offer[0]?.priceCents ?? row.internalPriceCents;
      const commission = Math.round(row.internalPriceCents * percent / 100);
      const lineId = randomUUID();
      await tx`
        INSERT INTO order_lines (
          id, account_id, order_id, appointment_id, kind, service_id, professional_id,
          description, qty, price_cents, list_price_cents, commission_percent, commission_cents, package_credit_id
        ) VALUES (
          ${lineId}, ${accountId}, ${orderId}, ${row.appointmentId}, 'servico', ${row.serviceId}, ${row.professionalId},
          ${row.serviceName}, 1, 0, ${sheet}, ${percent}, ${commission}, ${row.creditId}
        )
      `;
      await tx`UPDATE appointments SET order_id = ${orderId} WHERE id = ${row.appointmentId}`;
      await tx`
        UPDATE package_credits SET order_line_id = ${lineId}
        WHERE id = ${row.creditId} AND order_line_id IS NULL
      `;
      await stampReferral(tx, accountId, orderId, lineId, row.internalPriceCents);
      await writeEvent(tx, {
        accountId,
        orderId,
        lineId,
        appointmentId: row.appointmentId,
        actorId,
        kind: "valor",
        summary: `${row.serviceName} do pacote entrou na comanda do dia. Cobrança zerada. Comissão ${formatReais(commission)} sobre o interno ${formatReais(row.internalPriceCents)}.`,
        beforeCents: sheet,
        afterCents: 0,
      });
    }
  });
}

export async function schedulePackageVisit(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  const packageId = idOrNull(String(formData.get("package") ?? ""));
  const back = packageId ? `/pacotes/vendidos/${packageId}` : `/comandas/${orderId}`;
  return settle(back, async () => {
    const creditId = idOrNull(String(formData.get("credit") ?? ""));
    const professionalId = idOrNull(String(formData.get("professional") ?? ""));
    const day = dayParam(String(formData.get("day") ?? ""));
    const start = String(formData.get("start") ?? "");
    if (!creditId || !professionalId || !TIME.test(start)) throw new FormError("dados");
    await db().begin(async (tx) => {
      const placed = await placePackageCredit(tx, {
        accountId: user.accountId,
        actorId: user.id,
        creditId,
        professionalId,
        day,
        start,
      });
      if (!placed.ok) throw new FormError(placed.code);
    });
    return back;
  });
}

export async function usePackageVisitNow(formData: FormData) {
  const user = await requireOperator();
  const packageId = idOrNull(String(formData.get("package") ?? ""));
  const back = packageId ? `/pacotes/vendidos/${packageId}` : "/pacotes/vendidos";
  return settle(back, async () => {
    const creditId = idOrNull(String(formData.get("credit") ?? ""));
    const professionalId = idOrNull(String(formData.get("professional") ?? ""));
    const start = String(formData.get("start") ?? "");
    if (!creditId || !professionalId || !TIME.test(start)) throw new FormError("dados");
    const orderId = await db().begin(async (tx) => {
      const placed = await placePackageCredit(tx, {
        accountId: user.accountId,
        actorId: user.id,
        creditId,
        professionalId,
        day: todaySaoPaulo(),
        start,
        consume: true,
      });
      if (!placed.ok) throw new FormError(placed.code);
      if (!placed.orderId) throw new FormError("dados");
      return placed.orderId;
    });
    return `/comandas/${orderId}`;
  });
}

export async function movePackageVisit(formData: FormData) {
  const user = await requireOperator();
  const packageId = idOrNull(String(formData.get("package") ?? ""));
  const back = packageId ? `/pacotes/vendidos/${packageId}` : "/pacotes/vendidos";
  return settle(back, async () => {
    const creditId = idOrNull(String(formData.get("credit") ?? ""));
    const professionalId = idOrNull(String(formData.get("professional") ?? ""));
    const day = dayParam(String(formData.get("day") ?? ""));
    const start = String(formData.get("start") ?? "");
    if (!creditId || !professionalId || !TIME.test(start)) throw new FormError("dados");
    await db().begin(async (tx) => {
      const current = await tx<{
        lineId: string | null;
        appointmentId: string | null;
        orderId: string | null;
        orderStatus: string | null;
        when: string | null;
        serviceName: string;
      }[]>`
        SELECT l.id AS "lineId",
               COALESCE(l.appointment_id, c.appointment_id) AS "appointmentId",
               l.order_id AS "orderId",
               o.status AS "orderStatus", s.name AS "serviceName",
               to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS "when"
        FROM package_credits c
        JOIN client_packages cp ON cp.id = c.client_package_id
        JOIN services s ON s.id = c.service_id
        LEFT JOIN order_lines l ON l.id = c.order_line_id
        LEFT JOIN orders o ON o.id = l.order_id
        LEFT JOIN appointments a ON a.id = COALESCE(l.appointment_id, c.appointment_id) AND a.status <> 'cancelado'
        WHERE c.id = ${creditId} AND c.account_id = ${user.accountId}
          AND c.status = 'agendado' AND cp.status = 'ativo'
      `;
      if (!current[0] || (!current[0].lineId && !current[0].appointmentId)) throw new FormError("credito");
      if (current[0].orderStatus === "fechada") throw new FormError("fechada");
      await tx`
        UPDATE package_credits
        SET status = 'falta_agendar', order_line_id = NULL, appointment_id = NULL, used_on = NULL
        WHERE id = ${creditId}
      `;
      await tx`DELETE FROM order_lines WHERE id = ${current[0].lineId}`;
      if (current[0].appointmentId) {
        await tx`DELETE FROM appointments WHERE id = ${current[0].appointmentId} AND account_id = ${user.accountId}`;
      }
      const placed = await placePackageCredit(tx, {
        accountId: user.accountId,
        actorId: user.id,
        creditId,
        professionalId,
        day,
        start,
        summary: `Remarcou ${current[0].serviceName} do pacote${current[0].when ? ` (era ${current[0].when})` : ""} para ${formatDay(day)} ${start}.`,
      });
      if (!placed.ok) throw new FormError(placed.code);
    });
    return back;
  });
}

export async function cancelPackageSale(formData: FormData) {
  const user = await requireOperator();
  const packageId = idOrNull(String(formData.get("package") ?? ""));
  const back = packageId ? `/pacotes/vendidos/${packageId}` : "/pacotes/vendidos";
  return settle(back, async () => {
    const reason = String(formData.get("reason") ?? "").trim();
    if (!packageId || reason.length < 3 || reason.length > 300) throw new FormError("dados");
    await db().begin(async (tx) => {
      const held = await tx<{
        name: string;
        priceCents: number;
        status: string;
        orderId: string | null;
        lineId: string | null;
        orderStatus: string | null;
        clientName: string;
        catalogId: string | null;
        commissionPercent: number;
      }[]>`
        SELECT cp.name, cp.price_cents AS "priceCents", cp.status,
               cp.order_id AS "orderId", cp.order_line_id AS "lineId",
               o.status AS "orderStatus", c.name AS "clientName",
               cp.package_id AS "catalogId",
               COALESCE(l.commission_percent, 0) AS "commissionPercent"
        FROM client_packages cp
        JOIN clients c ON c.id = cp.client_id
        LEFT JOIN orders o ON o.id = cp.order_id
        LEFT JOIN order_lines l ON l.id = cp.order_line_id
        WHERE cp.id = ${packageId} AND cp.account_id = ${user.accountId}
      `;
      if (held[0]?.status !== "ativo") throw new FormError("pacote");
      const open = await tx<{
        id: string;
        internalPriceCents: number;
        lineId: string | null;
        linePrice: number | null;
        appointmentId: string | null;
        orderId: string | null;
        serviceName: string;
      }[]>`
        SELECT cr.id, cr.internal_price_cents AS "internalPriceCents",
               cr.order_line_id AS "lineId", l.price_cents AS "linePrice",
               COALESCE(l.appointment_id, cr.appointment_id) AS "appointmentId", l.order_id AS "orderId",
               s.name AS "serviceName"
        FROM package_credits cr
        JOIN services s ON s.id = cr.service_id
        LEFT JOIN order_lines l ON l.id = cr.order_line_id
        WHERE cr.client_package_id = ${packageId} AND cr.status <> 'usado'
      `;
      const used = await tx<{ internalPriceCents: number }[]>`
        SELECT internal_price_cents AS "internalPriceCents"
        FROM package_credits
        WHERE client_package_id = ${packageId} AND status = 'usado'
      `;
      for (const row of open) {
        if (row.orderId) {
          await writeEvent(tx, {
            accountId: user.accountId,
            orderId: row.orderId,
            lineId: row.lineId,
            appointmentId: row.appointmentId,
            actorId: user.id,
            kind: "cancelamento",
            summary: `${row.serviceName} saiu do pacote ${held[0].name}. ${reason}`,
            beforeCents: row.linePrice,
            afterCents: null,
          });
        }
        if (row.lineId) await tx`DELETE FROM order_lines WHERE id = ${row.lineId}`;
        if (row.appointmentId) {
          await tx`DELETE FROM appointments WHERE id = ${row.appointmentId} AND account_id = ${user.accountId}`;
        }
        await tx`DELETE FROM package_credits WHERE id = ${row.id}`;
      }
      const keptServices = used.reduce((sum, row) => sum + row.internalPriceCents, 0);
      const allServices = keptServices + open.reduce((sum, row) => sum + row.internalPriceCents, 0);
      const productValue = Math.max(0, held[0].priceCents - allServices);
      const kept = used.length > 0 ? keptServices + productValue : 0;
      const refund = Math.max(0, held[0].priceCents - kept);
      if (held[0].orderStatus === "aberta" && held[0].lineId) {
        const commission = Math.round(kept * held[0].commissionPercent / 100);
        await tx`
          UPDATE order_lines
          SET price_cents = ${kept}, commission_cents = ${commission}
          WHERE id = ${held[0].lineId}
        `;
        if (held[0].orderId) {
          await stampReferral(tx, user.accountId, held[0].orderId, held[0].lineId, kept);
        }
      }
      const paidRows = held[0].orderId
        ? await tx<{ paid: number }[]>`
            SELECT COALESCE(SUM(amount_cents), 0)::int AS paid FROM payments WHERE order_id = ${held[0].orderId}
          `
        : [{ paid: 0 }];
      const paid = paidRows[0]?.paid ?? 0;
      const cashOut = !held[0].orderId || held[0].orderStatus === "fechada"
        ? refund
        : Math.max(0, Math.min(refund, paid - kept));
      if (cashOut > 0) {
        await tx`
          INSERT INTO cash_movements (id, account_id, day, amount_cents, origin, label, order_id)
          VALUES (
            ${randomUUID()}, ${user.accountId}, ${todaySaoPaulo()}::date, ${-cashOut}, 'estorno',
            ${`Estorno ${held[0].name} · ${held[0].clientName}. ${reason}`}, ${held[0].orderId}
          )
        `;
      }
      if (used.length === 0 && held[0].catalogId) {
        const products = await tx<{ productId: string; qty: number }[]>`
          SELECT product_id AS "productId", qty FROM package_items
          WHERE package_id = ${held[0].catalogId} AND kind = 'product'
        `;
        for (const product of products) {
          await tx`
            INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by)
            VALUES (
              ${randomUUID()}, ${user.accountId}, ${product.productId}, ${product.qty}, 'ajuste',
              ${"estorno do pacote"}, ${user.id}
            )
          `;
        }
      }
      await tx`
        UPDATE client_packages
        SET status = 'cancelado', cancel_reason = ${reason}
        WHERE id = ${packageId}
      `;
      const where = cashOut > 0
        ? `Estorno ${formatReais(cashOut)} no caixa de hoje.`
        : `A comanda passou a ${formatReais(kept)}. O caixa não mexeu porque esse valor ainda não tinha entrado.`;
      await writeEvent(tx, {
        accountId: user.accountId,
        orderId: held[0].orderId,
        lineId: held[0].lineId,
        appointmentId: null,
        actorId: user.id,
        kind: "cancelamento",
        summary: `Cancelou o pacote ${held[0].name}. ${reason} ${where}`,
        beforeCents: held[0].priceCents,
        afterCents: kept,
      });
    });
    return back;
  });
}

export async function repeatPackageVisits(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const serviceId = idOrNull(String(formData.get("service") ?? ""));
    const professionalId = idOrNull(String(formData.get("professional") ?? ""));
    const weekday = Number(formData.get("weekday"));
    const start = String(formData.get("start") ?? "");
    if (!serviceId || !professionalId || !TIME.test(start) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      throw new FormError("dados");
    }
    await db().begin(async (tx) => {
      const order = await tx<{ clientId: string | null; day: string; kind: string }[]>`
        SELECT client_id AS "clientId", to_char(day, 'YYYY-MM-DD') AS day, kind
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.kind !== "cliente" || !order[0].clientId) throw new FormError("cliente");
      const credits = await tx<{ id: string }[]>`
        SELECT c.id
        FROM package_credits c
        JOIN client_packages cp ON cp.id = c.client_package_id
        WHERE cp.account_id = ${user.accountId} AND cp.client_id = ${order[0].clientId}
          AND cp.status = 'ativo' AND c.service_id = ${serviceId} AND c.status = 'falta_agendar'
        ORDER BY cp.created_at, c.position
      `;
      if (!credits.length) throw new FormError("credito");
      let cursor = order[0].day;
      let lastCode = "ocupado";
      for (const credit of credits) {
        let day = firstWeekdayAfter(cursor, weekday);
        let placed = false;
        for (let attempt = 0; attempt < 26; attempt++) {
          const result = await placePackageCredit(tx, {
            accountId: user.accountId,
            actorId: user.id,
            creditId: credit.id,
            professionalId,
            day,
            start,
          });
          if (result.ok) {
            cursor = day;
            placed = true;
            break;
          }
          lastCode = result.code;
          if (!SKIP_SLOT.has(result.code)) throw new FormError(result.code);
          day = shiftDay(day, 7);
        }
        if (!placed) throw new FormError(lastCode);
      }
    });
    return `/comandas/${orderId}`;
  });
}

export async function pardonPackage(formData: FormData) {
  const user = await requireOperator();
  const packageId = idOrNull(String(formData.get("package") ?? ""));
  const orderId = idOrNull(String(formData.get("order") ?? "")) ?? "";
  const creditId = idOrNull(String(formData.get("credit") ?? ""));
  const back = packageId ? `/pacotes/vendidos/${packageId}` : `/comandas/${orderId}`;
  return settle(back, async () => {
    if (!packageId) throw new FormError("dados");
    const today = todaySaoPaulo();
    await db().begin(async (tx) => {
      const held = await tx<{
        clientId: string;
        saleOrderId: string | null;
        validityDays: number;
        validUntil: string | null;
        name: string;
      }[]>`
        SELECT client_id AS "clientId", order_id AS "saleOrderId",
               validity_days AS "validityDays", to_char(valid_until, 'YYYY-MM-DD') AS "validUntil", name
        FROM client_packages
        WHERE id = ${packageId} AND account_id = ${user.accountId} AND status = 'ativo'
      `;
      if (!held[0]?.validUntil) throw new FormError("prazo");
      let eventOrderId = held[0].saleOrderId;
      if (orderId) {
        const order = await tx<{ clientId: string | null; kind: string }[]>`
          SELECT client_id AS "clientId", kind
          FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
        `;
        if (order[0]?.kind !== "cliente" || order[0].clientId !== held[0].clientId) throw new FormError("cliente");
        eventOrderId = orderId;
      }
      const lateRows = await tx<{ creditId: string; day: string; serviceName: string }[]>`
        SELECT c.id AS "creditId",
               to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
               s.name AS "serviceName"
        FROM package_credits c
        JOIN services s ON s.id = c.service_id
        LEFT JOIN order_lines l ON l.id = c.order_line_id
        JOIN appointments a ON a.id = COALESCE(l.appointment_id, c.appointment_id) AND a.status <> 'cancelado'
        WHERE c.client_package_id = ${packageId}
          AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date > ${held[0].validUntil}::date
        ORDER BY a.starts_at
      `;
      const expired = held[0].validUntil < today;
      if (!expired && !lateRows.length) throw new FormError("prazo");
      const late = creditId
        ? lateRows.find((row) => row.creditId === creditId) ?? lateRows[0]
        : lateRows[0];
      const lateOn = late?.day ?? today;
      const last = await tx<{ day: string | null }[]>`
        SELECT to_char(max(a.starts_at AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') AS day
        FROM package_credits c
        LEFT JOIN order_lines l ON l.id = c.order_line_id
        JOIN appointments a ON a.id = COALESCE(l.appointment_id, c.appointment_id) AND a.status <> 'cancelado'
        WHERE c.client_package_id = ${packageId}
      `;
      let renewed = shiftDay(held[0].validUntil, held[0].validityDays);
      if (last[0]?.day && last[0].day > renewed) renewed = last[0].day;
      const sequenceRows = await tx<{ n: number }[]>`
        SELECT COALESCE(max(sequence), 0)::int AS n FROM package_pardons WHERE client_package_id = ${packageId}
      `;
      const sequence = (sequenceRows[0]?.n ?? 0) + 1;
      const expiredAt = new Date(`${held[0].validUntil}T12:00:00-03:00`).getTime();
      const lateAt = new Date(`${lateOn}T12:00:00-03:00`).getTime();
      const weeksLost = Math.max(0, Math.ceil((lateAt - expiredAt) / (7 * 24 * 60 * 60 * 1000)));
      await tx`
        UPDATE client_packages SET valid_until = ${renewed}::date WHERE id = ${packageId}
      `;
      await tx`
        INSERT INTO package_pardons (
          id, account_id, client_package_id, client_id, order_id, credit_id, actor_id,
          expired_on, late_on, renewed_until, sequence, weeks_lost
        ) VALUES (
          ${randomUUID()}, ${user.accountId}, ${packageId}, ${held[0].clientId}, ${eventOrderId}, ${late?.creditId ?? null}, ${user.id},
          ${held[0].validUntil}::date, ${lateOn}::date, ${renewed}::date, ${sequence}, ${weeksLost}
        )
      `;
      const weekWord = weeksLost === 1 ? "semana perdida" : "semanas perdidas";
      await writeEvent(tx, {
        accountId: user.accountId,
        orderId: eventOrderId,
        lineId: null,
        appointmentId: null,
        actorId: user.id,
        kind: "valor",
        summary: `Perdão ${sequence} do pacote ${held[0].name}. Prazo ${formatDay(held[0].validUntil)} → ${formatDay(renewed)}${late ? `. Ida atrasada ${late.serviceName} em ${formatDay(late.day)}` : ""}. ${weeksLost} ${weekWord}.`,
        beforeCents: null,
        afterCents: null,
      });
    });
    return orderId ? `/comandas/${orderId}` : `/pacotes/vendidos/${packageId}`;
  });
}

export async function chargePackageDifference(formData: FormData) {
  const user = await requireOperator();
  const creditId = idOrNull(String(formData.get("credit") ?? ""));
  const packageHint = idOrNull(String(formData.get("package") ?? ""));
  const orderHint = idOrNull(String(formData.get("order") ?? "")) ?? "";
  const back = packageHint ? `/pacotes/vendidos/${packageHint}` : `/comandas/${orderHint}`;
  return settle(back, async () => {
    if (!creditId) throw new FormError("dados");
    const targetOrderId = await db().begin(async (tx) => {
      const credit = await tx<{
        clientPackageId: string;
        clientId: string;
        packageName: string;
        serviceId: string;
        serviceName: string;
        servicePriceCents: number;
        serviceCommission: number;
        internalPriceCents: number;
        lineId: string | null;
        lineOrderId: string | null;
        lineOrderStatus: string | null;
        appointmentId: string | null;
        professionalId: string | null;
        listPriceCents: number | null;
        commissionPercent: number | null;
        validUntil: string | null;
        day: string | null;
        start: string | null;
      }[]>`
        SELECT c.client_package_id AS "clientPackageId", cp.client_id AS "clientId", cp.name AS "packageName",
               c.service_id AS "serviceId", s.name AS "serviceName",
               s.price_cents AS "servicePriceCents", s.commission_percent AS "serviceCommission",
               c.internal_price_cents AS "internalPriceCents", c.order_line_id AS "lineId",
               l.order_id AS "lineOrderId", o.status AS "lineOrderStatus",
               COALESCE(l.appointment_id, c.appointment_id) AS "appointmentId",
               COALESCE(a.professional_id, l.professional_id) AS "professionalId",
               l.list_price_cents AS "listPriceCents", l.commission_percent AS "commissionPercent",
               to_char(cp.valid_until, 'YYYY-MM-DD') AS "validUntil",
               to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
               to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start
        FROM package_credits c
        JOIN client_packages cp ON cp.id = c.client_package_id
        JOIN services s ON s.id = c.service_id
        LEFT JOIN order_lines l ON l.id = c.order_line_id
        LEFT JOIN orders o ON o.id = l.order_id
        LEFT JOIN appointments a ON a.id = COALESCE(l.appointment_id, c.appointment_id) AND a.status <> 'cancelado'
        WHERE c.id = ${creditId} AND c.account_id = ${user.accountId} AND cp.status = 'ativo'
      `;
      if (!credit[0]?.day || !credit[0].validUntil || !credit[0].appointmentId || !credit[0].professionalId) {
        throw new FormError("diferenca");
      }
      if (credit[0].day <= credit[0].validUntil) throw new FormError("diferenca");
      if (credit[0].lineOrderStatus === "fechada") throw new FormError("diferenca");

      let lineId = credit[0].lineId;
      let lineOrderId = credit[0].lineOrderId;
      let avulso = credit[0].listPriceCents;
      let percent = credit[0].commissionPercent;

      if (!lineId) {
        const offer = await tx<{ priceCents: number; commissionPercent: number }[]>`
          SELECT COALESCE(ps.price_cents, ${credit[0].servicePriceCents}) AS "priceCents",
                 COALESCE(ps.commission_percent, ${credit[0].serviceCommission}) AS "commissionPercent"
          FROM professionals p
          LEFT JOIN professional_services ps
            ON ps.professional_id = p.id AND ps.service_id = ${credit[0].serviceId}
          WHERE p.id = ${credit[0].professionalId} AND p.account_id = ${user.accountId}
        `;
        if (!offer[0]) throw new FormError("servico");
        avulso = await chargedServicePrice(
          tx,
          credit[0].serviceId,
          credit[0].day,
          credit[0].start ?? "09:00",
          offer[0].priceCents,
        );
        percent = offer[0].commissionPercent;
        const existing = await tx<{ id: string; status: string }[]>`
          SELECT id, status FROM orders
          WHERE account_id = ${user.accountId} AND client_id = ${credit[0].clientId}
            AND day = ${credit[0].day}::date AND kind = 'cliente'
        `;
        if (existing[0]?.status === "fechada") throw new FormError("fechada");
        lineOrderId = existing[0]?.id ?? randomUUID();
        if (!existing[0]) {
          await tx`
            INSERT INTO orders (id, account_id, client_id, day, kind, status)
            VALUES (${lineOrderId}, ${user.accountId}, ${credit[0].clientId}, ${credit[0].day}::date, 'cliente', 'aberta')
          `;
        }
        lineId = randomUUID();
        const dueSeed = Math.max(0, avulso - credit[0].internalPriceCents);
        const commissionSeed = Math.round(dueSeed * percent / 100);
        await tx`
          INSERT INTO order_lines (
            id, account_id, order_id, appointment_id, kind, service_id, professional_id,
            description, qty, price_cents, list_price_cents, commission_percent, commission_cents, package_credit_id
          ) VALUES (
            ${lineId}, ${user.accountId}, ${lineOrderId}, ${credit[0].appointmentId}, 'servico',
            ${credit[0].serviceId}, ${credit[0].professionalId}, ${credit[0].serviceName}, 1,
            ${dueSeed}, ${avulso}, ${percent}, ${commissionSeed}, ${creditId}
          )
        `;
        await tx`
          UPDATE appointments SET order_id = ${lineOrderId}
          WHERE id = ${credit[0].appointmentId} AND account_id = ${user.accountId}
        `;
        await tx`
          UPDATE package_credits SET order_line_id = ${lineId}
          WHERE id = ${creditId}
        `;
      }

      if (avulso == null || percent == null || !lineId) throw new FormError("diferenca");
      const due = Math.max(0, avulso - credit[0].internalPriceCents);
      const commission = Math.round(due * percent / 100);
      await tx`
        UPDATE order_lines
        SET price_cents = ${due}, list_price_cents = ${avulso}, commission_percent = ${percent},
            commission_cents = ${commission}, package_credit_id = NULL, courtesy = false
        WHERE id = ${lineId}
      `;
      if (lineOrderId) {
        await stampReferral(tx, user.accountId, lineOrderId, lineId, due);
      }
      await tx`
        UPDATE package_credits
        SET status = 'usado', used_on = ${credit[0].day}::date, order_line_id = ${lineId}
        WHERE id = ${creditId}
      `;
      const leftovers = await tx<{
        id: string;
        lineId: string | null;
        appointmentId: string | null;
        orderId: string | null;
        orderStatus: string | null;
        serviceName: string;
      }[]>`
        SELECT c.id, c.order_line_id AS "lineId",
               COALESCE(l.appointment_id, c.appointment_id) AS "appointmentId",
               l.order_id AS "orderId", o.status AS "orderStatus", s.name AS "serviceName"
        FROM package_credits c
        JOIN services s ON s.id = c.service_id
        LEFT JOIN order_lines l ON l.id = c.order_line_id
        LEFT JOIN orders o ON o.id = l.order_id
        WHERE c.client_package_id = ${credit[0].clientPackageId} AND c.id <> ${creditId} AND c.status <> 'usado'
      `;
      for (const row of leftovers) {
        if (row.orderStatus === "fechada") {
          if (row.lineId) await tx`UPDATE order_lines SET package_credit_id = NULL WHERE id = ${row.lineId}`;
        } else if (row.lineId && row.orderId) {
          await writeEvent(tx, {
            accountId: user.accountId,
            orderId: row.orderId,
            lineId: row.lineId,
            appointmentId: row.appointmentId,
            actorId: user.id,
            kind: "cancelamento",
            summary: `${row.serviceName} cancelado ao cobrar a diferença do pacote`,
            beforeCents: 0,
            afterCents: null,
          });
          await tx`DELETE FROM order_lines WHERE id = ${row.lineId}`;
          if (row.appointmentId) {
            await tx`
              UPDATE appointments SET status = 'cancelado'
              WHERE id = ${row.appointmentId} AND account_id = ${user.accountId}
            `;
          }
        } else if (row.appointmentId) {
          await tx`
            UPDATE appointments SET status = 'cancelado'
            WHERE id = ${row.appointmentId} AND account_id = ${user.accountId}
          `;
        }
        await tx`DELETE FROM package_credits WHERE id = ${row.id}`;
      }
      await tx`
        UPDATE client_packages SET status = 'encerrado' WHERE id = ${credit[0].clientPackageId}
      `;
      await writeEvent(tx, {
        accountId: user.accountId,
        orderId: lineOrderId,
        lineId,
        appointmentId: credit[0].appointmentId,
        actorId: user.id,
        kind: "valor",
        summary: `Cobrou a diferença de ${credit[0].serviceName} do pacote ${credit[0].packageName}. ${formatReais(0)} → ${formatReais(due)} (avulso ${formatReais(avulso)} − interno ${formatReais(credit[0].internalPriceCents)}). Pacote encerrado.`,
        beforeCents: 0,
        afterCents: due,
      });
      return lineOrderId;
    });
    if (!targetOrderId) throw new FormError("diferenca");
    return `/comandas/${targetOrderId}`;
  });
}

async function takePackageCredit(
  tx: TransactionSql,
  input: {
    accountId: string;
    actorId: string;
    orderId: string;
    clientId: string;
    day: string;
    lineId: string;
  },
) {
  const line = await tx<{
    serviceId: string | null;
    description: string;
    priceCents: number;
    professionalId: string | null;
    appointmentId: string | null;
    packageCreditId: string | null;
    kind: string;
  }[]>`
    SELECT service_id AS "serviceId", description, price_cents AS "priceCents",
           professional_id AS "professionalId", appointment_id AS "appointmentId",
           package_credit_id AS "packageCreditId", kind
    FROM order_lines
    WHERE id = ${input.lineId} AND order_id = ${input.orderId}
  `;
  if (!line[0] || line[0].kind !== "servico" || !line[0].serviceId || line[0].packageCreditId) return false;
  const credit = await tx<{
    id: string;
    internalPriceCents: number;
    clientPackageId: string;
    packageName: string;
    validityDays: number;
    started: boolean;
  }[]>`
    SELECT c.id, c.internal_price_cents AS "internalPriceCents",
           c.client_package_id AS "clientPackageId", cp.name AS "packageName",
           cp.validity_days AS "validityDays", cp.first_used_on IS NOT NULL AS started
    FROM package_credits c
    JOIN client_packages cp ON cp.id = c.client_package_id
    WHERE cp.account_id = ${input.accountId}
      AND cp.client_id = ${input.clientId}
      AND cp.status = 'ativo'
      AND c.service_id = ${line[0].serviceId}
      AND c.status = 'falta_agendar'
      AND (cp.valid_until IS NULL OR cp.valid_until >= ${input.day}::date)
    ORDER BY cp.created_at, c.position
    LIMIT 1
  `;
  if (!credit[0]) return false;
  const percentRows = await tx<{ commissionPercent: number }[]>`
    SELECT COALESCE(ps.commission_percent, s.commission_percent) AS "commissionPercent"
    FROM services s
    LEFT JOIN professional_services ps
      ON ps.service_id = s.id AND ps.professional_id = ${line[0].professionalId}
    WHERE s.id = ${line[0].serviceId} AND s.account_id = ${input.accountId}
  `;
  const percent = percentRows[0]?.commissionPercent ?? 0;
  const commission = Math.round(credit[0].internalPriceCents * percent / 100);
  await tx`
    UPDATE order_lines
    SET price_cents = 0, commission_percent = ${percent}, commission_cents = ${commission},
        courtesy = false, package_credit_id = ${credit[0].id}
    WHERE id = ${input.lineId}
  `;
  await stampReferral(tx, input.accountId, input.orderId, input.lineId, credit[0].internalPriceCents);
  await tx`
    UPDATE package_credits
    SET status = 'usado', order_line_id = ${input.lineId}, used_on = ${input.day}::date
    WHERE id = ${credit[0].id}
  `;
  if (!credit[0].started) {
    await tx`
      UPDATE client_packages
      SET first_used_on = ${input.day}::date,
          valid_until = ${shiftDay(input.day, credit[0].validityDays)}::date
      WHERE id = ${credit[0].clientPackageId} AND first_used_on IS NULL
    `;
  }
  const left = await tx<{ n: number }[]>`
    SELECT count(*)::int AS n FROM package_credits
    WHERE client_package_id = ${credit[0].clientPackageId} AND status <> 'usado'
  `;
  if ((left[0]?.n ?? 0) === 0) {
    await tx`UPDATE client_packages SET status = 'concluido' WHERE id = ${credit[0].clientPackageId}`;
  }
  await writeEvent(tx, {
    accountId: input.accountId,
    orderId: input.orderId,
    lineId: input.lineId,
    appointmentId: line[0].appointmentId,
    actorId: input.actorId,
    kind: "valor",
    summary: `Abateu ${line[0].description} do pacote ${credit[0].packageName}. ${formatReais(line[0].priceCents)} → ${formatReais(0)}. Comissão ${formatReais(commission)} sobre o interno ${formatReais(credit[0].internalPriceCents)}.`,
    beforeCents: line[0].priceCents,
    afterCents: 0,
  });
  return true;
}

export async function toggleCourtesy(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  const lineId = String(formData.get("line") ?? "");
  await db().begin(async (tx) => {
    const order = await tx<{ status: string }[]>`
      SELECT status FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
    `;
    if (order[0]?.status !== "aberta") throw new FormError("fechada");
    const line = await tx<{
      courtesy: boolean;
      description: string;
      priceCents: number;
      listPriceCents: number;
      commissionPercent: number;
      kind: string;
      packageCreditId: string | null;
    }[]>`
      SELECT courtesy, description, price_cents AS "priceCents", list_price_cents AS "listPriceCents",
             commission_percent AS "commissionPercent", kind, package_credit_id AS "packageCreditId"
      FROM order_lines WHERE id = ${lineId} AND order_id = ${orderId}
    `;
    if (!line[0]) throw new FormError("dados");
    if (line[0].kind === "pacote" || line[0].packageCreditId) throw new FormError("pacote");
    const courtesy = !line[0].courtesy;
    const price = courtesy ? 0 : line[0].listPriceCents;
    const commission = Math.round(line[0].listPriceCents * line[0].commissionPercent / 100);
    await tx`
      UPDATE order_lines
      SET courtesy = ${courtesy}, price_cents = ${price}, commission_cents = ${commission}
      WHERE id = ${lineId}
    `;
    await stampReferral(tx, user.accountId, orderId, lineId, line[0].listPriceCents);
    await writeEvent(tx, {
      accountId: user.accountId,
      orderId,
      lineId,
      appointmentId: null,
      actorId: user.id,
      kind: "valor",
      summary: courtesy
        ? `${line[0].description} cortesia. Cobrança zerada. Comissão no preço de tabela ${formatReais(line[0].listPriceCents)}.`
        : `${line[0].description} voltou a cobrar ${formatReais(price)}.`,
      beforeCents: line[0].priceCents,
      afterCents: price,
    });
  });
  const { redirect } = await import("next/navigation");
  redirect(`/comandas/${orderId}`);
}

export async function adjustLinePrice(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  const lineId = idOrNull(String(formData.get("line") ?? ""));
  return settle(`/comandas/${orderId}`, async () => {
    if (!lineId) throw new FormError("dados");
    const amountRaw = String(formData.get("amount") ?? "").trim();
    const discountRaw = String(formData.get("discount") ?? "").trim();
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string }[]>`
        SELECT status, kind FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta" || order[0].kind !== "cliente") throw new FormError("fechada");
      const line = await tx<{
        description: string;
        priceCents: number;
        listPriceCents: number;
        commissionPercent: number;
        courtesy: boolean;
        appointmentId: string | null;
        kind: string;
        packageCreditId: string | null;
      }[]>`
        SELECT description, price_cents AS "priceCents", list_price_cents AS "listPriceCents",
               commission_percent AS "commissionPercent", courtesy, appointment_id AS "appointmentId",
               kind, package_credit_id AS "packageCreditId"
        FROM order_lines WHERE id = ${lineId} AND order_id = ${orderId}
      `;
      if (!line[0]) throw new FormError("fora");
      if (line[0].kind === "pacote" || line[0].packageCreditId) throw new FormError("pacote");
      let next: number | null = null;
      let how = "";
      if (amountRaw) {
        next = parseReais(amountRaw);
        if (next == null) throw new FormError("dados");
        how = "valor manual";
      } else if (discountRaw) {
        const percent = parsePercent(discountRaw);
        if (percent == null) throw new FormError("dados");
        next = Math.round(line[0].listPriceCents * (100 - percent) / 100);
        how = `desconto ${percent}% sobre ${formatReais(line[0].listPriceCents)}`;
      } else {
        throw new FormError("dados");
      }
      if (next === line[0].priceCents && !line[0].courtesy) return;
      const commission = Math.round(next * line[0].commissionPercent / 100);
      await tx`
        UPDATE order_lines
        SET price_cents = ${next}, commission_cents = ${commission}, courtesy = false
        WHERE id = ${lineId}
      `;
      await stampReferral(tx, user.accountId, orderId, lineId, next);
      await writeEvent(tx, {
        accountId: user.accountId,
        orderId,
        lineId,
        appointmentId: line[0].appointmentId,
        actorId: user.id,
        kind: "valor",
        summary: `${line[0].description}: ${formatReais(line[0].priceCents)} → ${formatReais(next)} (${how}). Comissão ${formatReais(commission)}.`,
      beforeCents: line[0].priceCents,
      afterCents: next,
    });
    });
    return `/comandas/${orderId}`;
  });
}

export async function adjustLineCommission(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  const lineId = idOrNull(String(formData.get("line") ?? ""));
  return settle(`/comandas/${orderId}`, async () => {
    if (!lineId) throw new FormError("dados");
    const percent = parsePercent(formData.get("percent"));
    if (percent == null) throw new FormError("percentual");
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string }[]>`
        SELECT status, kind FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta" || order[0].kind !== "cliente") throw new FormError("fechada");
      const line = await tx<{
        description: string;
        priceCents: number;
        commissionPercent: number;
        appointmentId: string | null;
        kind: string;
        packageCreditId: string | null;
      }[]>`
        SELECT description, price_cents AS "priceCents", commission_percent AS "commissionPercent",
               appointment_id AS "appointmentId", kind, package_credit_id AS "packageCreditId"
        FROM order_lines WHERE id = ${lineId} AND order_id = ${orderId}
      `;
      if (!line[0]) throw new FormError("fora");
      if (line[0].kind !== "servico" || !line[0].packageCreditId) throw new FormError("pacote");
      if (percent === line[0].commissionPercent) return;
      const credit = await tx<{ internalPriceCents: number }[]>`
        SELECT internal_price_cents AS "internalPriceCents"
        FROM package_credits WHERE id = ${line[0].packageCreditId} AND account_id = ${user.accountId}
      `;
      if (!credit[0]) throw new FormError("credito");
      const commission = Math.round(credit[0].internalPriceCents * percent / 100);
      await tx`
        UPDATE order_lines
        SET commission_percent = ${percent}, commission_cents = ${commission}
        WHERE id = ${lineId}
      `;
      await writeEvent(tx, {
        accountId: user.accountId,
        orderId,
        lineId,
        appointmentId: line[0].appointmentId,
        actorId: user.id,
        kind: "valor",
        summary: `${line[0].description}: comissão ${line[0].commissionPercent}% → ${percent}% sobre o interno ${formatReais(credit[0].internalPriceCents)}. O valor cobrado permanece ${formatReais(line[0].priceCents)}.`,
        beforeCents: line[0].priceCents,
        afterCents: line[0].priceCents,
      });
    });
    return `/comandas/${orderId}`;
  });
}

async function cardRate(
  tx: TransactionSql,
  accountId: string,
  method: string,
  acquirerId: string | null,
  brandId: string | null,
) {
  if (method !== "debito" && method !== "credito") return { bps: 0, name: null as string | null };
  if (acquirerId) {
    const rows = await tx<{ name: string; debitBps: number; creditBps: number }[]>`
      SELECT name, debit_bps AS "debitBps", credit_bps AS "creditBps"
      FROM card_acquirers
      WHERE id = ${acquirerId} AND account_id = ${accountId} AND active
    `;
    if (!rows[0]) throw new FormError("maquina");
    const brands = await tx<{ id: string; name: string; debitBps: number; creditBps: number }[]>`
      SELECT id, name, debit_bps AS "debitBps", credit_bps AS "creditBps"
      FROM card_brands
      WHERE acquirer_id = ${acquirerId} AND account_id = ${accountId} AND active
    `;
    if (brands.length && !brandId) throw new FormError("bandeira");
    const brand = brandId ? brands.find((row) => row.id === brandId) : null;
    if (brandId && !brand) throw new FormError("bandeira");
    const bps = brand
      ? method === "debito" ? brand.debitBps : brand.creditBps
      : method === "debito" ? rows[0].debitBps : rows[0].creditBps;
    return { bps, name: brand ? `${rows[0].name} · ${brand.name}` : rows[0].name };
  }
  const machines = await tx<{ id: string }[]>`
    SELECT id FROM card_acquirers WHERE account_id = ${accountId} AND active LIMIT 1
  `;
  if (machines.length) throw new FormError("maquina");
  const rows = await tx<{ debit: number; credit: number }[]>`
    SELECT card_debit_percent AS debit, card_credit_percent AS credit
    FROM accounts WHERE id = ${accountId}
  `;
  const percent = method === "debito" ? rows[0]?.debit ?? 0 : rows[0]?.credit ?? 0;
  return { bps: percent * 100, name: null as string | null };
}

export async function addPayment(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const method = String(formData.get("method") ?? "");
    const amount = parseReais(String(formData.get("amount") ?? ""));
    if (!["dinheiro", "pix", "debito", "credito", "outros"].includes(method) || amount == null || amount < 1) {
      throw new FormError("dados");
    }
    const bankRaw = String(formData.get("bank") ?? "");
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; day: string; clientName: string | null }[]>`
        SELECT o.status, to_char(o.day, 'YYYY-MM-DD') AS day, c.name AS "clientName"
        FROM orders o
        LEFT JOIN clients c ON c.id = o.client_id
        WHERE o.id = ${orderId} AND o.account_id = ${user.accountId} AND o.kind = 'cliente'
      `;
      if (order[0]?.status !== "aberta") throw new FormError("fechada");
      let bankId: string | null = null;
      if (bankRaw) {
        if (!UUID.test(bankRaw)) throw new FormError("dados");
        const bank = await tx`
          SELECT id FROM bank_accounts WHERE id = ${bankRaw} AND account_id = ${user.accountId} AND active
        `;
        if (!bank.length) throw new FormError("fora");
        bankId = bankRaw;
      }
      const paymentId = randomUUID();
      const acquirerRaw = String(formData.get("acquirer") ?? "");
      const acquirerId = acquirerRaw && UUID.test(acquirerRaw) ? acquirerRaw : null;
      const brandRaw = String(formData.get("brand") ?? "");
      const brandId = brandRaw && UUID.test(brandRaw) ? brandRaw : null;
      if ((method === "debito" || method === "credito") && acquirerRaw && !acquirerId) throw new FormError("maquina");
      if ((method === "debito" || method === "credito") && brandRaw && !brandId) throw new FormError("bandeira");
      const rate = await cardRate(tx, user.accountId, method, acquirerId, brandId);
      const lines = rate.bps > 0
        ? await tx<{ id: string; priceCents: number; commissionCents: number; abatementCents: number }[]>`
            SELECT id, price_cents AS "priceCents", commission_cents AS "commissionCents",
                   abatement_cents AS "abatementCents"
            FROM order_lines
            WHERE order_id = ${orderId} AND professional_id IS NOT NULL
            ORDER BY created_at, id
          `
        : [];
      const fee = cardFeeShares(amount, rate.bps, lines);
      await tx`
        INSERT INTO payments (id, account_id, order_id, method, amount_cents, bank_account_id, paid_on, fee_cents, acquirer_id, brand_id)
        VALUES (
          ${paymentId}, ${user.accountId}, ${orderId}, ${method}, ${amount},
          ${bankId}, ${bankId ? todaySaoPaulo() : null}::date, ${fee.feeCents}, ${acquirerId}, ${brandId}
        )
      `;
      if (!bankId) {
        await tx`
          INSERT INTO cash_movements (id, account_id, day, amount_cents, origin, label, payment_id, order_id)
          VALUES (
            ${randomUUID()}, ${user.accountId}, ${order[0].day}, ${amount}, 'pagamento',
            ${order[0].clientName ?? "Sem nome"}, ${paymentId}, ${orderId}
          )
        `;
      }
      if (fee.feeCents > 0) {
        await tx`
          INSERT INTO cash_movements (id, account_id, day, amount_cents, origin, label, payment_id, order_id)
          VALUES (
            ${randomUUID()}, ${user.accountId}, ${bankId ? todaySaoPaulo() : order[0].day}, ${-fee.feeCents},
            'taxa_cartao', ${rate.name ? `Taxa · ${rate.name}` : "Taxa de cartão"}, ${paymentId}, ${orderId}
          )
        `;
      }
      for (const share of fee.shares) {
        await tx`
          UPDATE order_lines
          SET abatement_cents = abatement_cents + ${share.abatementCents}
          WHERE id = ${share.id} AND order_id = ${orderId}
        `;
        await tx`
          INSERT INTO card_fee_shares (id, account_id, payment_id, line_id, abatement_cents)
          VALUES (${randomUUID()}, ${user.accountId}, ${paymentId}, ${share.id}, ${share.abatementCents})
        `;
      }
    });
    return `/comandas/${orderId}`;
  });
}

export async function applyClientCredit(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const amount = parseReais(String(formData.get("amount") ?? ""));
    if (amount == null || amount < 1) throw new FormError("dados");
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; clientId: string | null; totalCents: number; paidCents: number }[]>`
        SELECT o.status, o.client_id AS "clientId",
               COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)::int AS "totalCents",
               COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)::int AS "paidCents"
        FROM orders o
        WHERE o.id = ${orderId} AND o.account_id = ${user.accountId} AND o.kind = 'cliente'
      `;
      const row = order[0];
      if (!row || row.status !== "aberta" || !row.clientId) throw new FormError("dados");
      const gap = row.totalCents - row.paidCents;
      const credit = await tx<{ creditCents: number }[]>`
        SELECT GREATEST(
          0,
          COALESCE(SUM(GREATEST(cash_paid - total, 0)), 0) - COALESCE(SUM(conta_paid), 0)
        )::int AS "creditCents"
        FROM (
          SELECT COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0) AS total,
                 COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id AND pay.method <> 'conta'), 0) AS cash_paid,
                 COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id AND pay.method = 'conta'), 0) AS conta_paid
          FROM orders o
          WHERE o.account_id = ${user.accountId} AND o.client_id = ${row.clientId} AND o.kind = 'cliente'
        ) bills
      `;
      const available = credit[0]?.creditCents ?? 0;
      if (gap < 1 || amount > gap || amount > available) throw new FormError("saldo");
      await tx`
        INSERT INTO payments (id, account_id, order_id, method, amount_cents, fee_cents)
        VALUES (${randomUUID()}, ${user.accountId}, ${orderId}, 'conta', ${amount}, 0)
      `;
      await writeEvent(tx, {
        accountId: user.accountId,
        orderId,
        lineId: null,
        appointmentId: null,
        actorId: user.id,
        kind: "valor",
        summary: "Crédito da conta",
        beforeCents: available,
        afterCents: available - amount,
      });
    });
    return `/comandas/${orderId}`;
  });
}

export async function removePayment(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  const paymentId = String(formData.get("payment") ?? "");
  await db().begin(async (tx) => {
    const order = await tx<{ status: string }[]>`
      SELECT status FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
    `;
    if (order[0]?.status !== "aberta") throw new FormError("fechada");
    const shares = await tx<{ lineId: string; abatementCents: number }[]>`
      SELECT line_id AS "lineId", abatement_cents AS "abatementCents"
      FROM card_fee_shares
      WHERE payment_id = ${paymentId} AND account_id = ${user.accountId}
    `;
    for (const share of shares) {
      await tx`
        UPDATE order_lines
        SET abatement_cents = GREATEST(0, abatement_cents - ${share.abatementCents})
        WHERE id = ${share.lineId} AND order_id = ${orderId}
      `;
    }
    await tx`DELETE FROM card_fee_shares WHERE payment_id = ${paymentId} AND account_id = ${user.accountId}`;
    await tx`DELETE FROM cash_movements WHERE payment_id = ${paymentId} AND account_id = ${user.accountId}`;
    await tx`DELETE FROM payments WHERE id = ${paymentId} AND order_id = ${orderId}`;
  });
  const { redirect } = await import("next/navigation");
  redirect(`/comandas/${orderId}`);
}

export async function registerDrawerMove(formData: FormData) {
  const user = await requireOperator();
  const day = dayParam(String(formData.get("day") ?? ""));
  return settle(`/caixa?dia=${day}`, async () => {
    const kind = String(formData.get("kind") ?? "");
    const note = String(formData.get("note") ?? "").trim();
    const amount = parseReais(String(formData.get("amount") ?? ""));
    if ((kind !== "sangria" && kind !== "suprimento") || amount == null || amount <= 0 || note.length < 2) {
      throw new FormError("dados");
    }
    const signed = kind === "sangria" ? -amount : amount;
    const word = kind === "sangria" ? "Sangria" : "Suprimento";
    await db()`
      INSERT INTO cash_movements (id, account_id, day, amount_cents, origin, label)
      VALUES (
        ${randomUUID()}, ${user.accountId}, ${day}::date, ${signed}, ${kind},
        ${`${word} · ${note}`}
      )
    `;
    return `/caixa?dia=${day}&ok=gaveta`;
  });
}

export async function closeOrder(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  const stay = formData.get("voltar") === "agenda";
  const own = await scope(user.id, user.role);
  const fail = await db().begin(async (tx) => {
    const order = await tx<{
      status: string;
      kind: string;
      day: string;
      professionalId: string | null;
      professionalName: string | null;
      incomplete: boolean;
    }[]>`
      SELECT o.status, o.kind, to_char(o.day, 'YYYY-MM-DD') AS day,
             o.professional_id AS "professionalId", p.name AS "professionalName", o.incomplete
      FROM orders o
      LEFT JOIN professionals p ON p.id = o.professional_id
      WHERE o.id = ${orderId} AND o.account_id = ${user.accountId}
    `;
    if (!order[0] || order[0].status !== "aberta") return "fechada";
    if (order[0].kind === "consumo") {
      if (own && order[0].professionalId !== own) return "fora";
      await tx`UPDATE orders SET status = 'fechada' WHERE id = ${orderId}`;
      await tx`
        INSERT INTO cash_movements (id, account_id, day, amount_cents, origin, label, order_id)
        VALUES (
          ${randomUUID()}, ${user.accountId}, ${order[0].day}, 0, 'consumo_interno',
          ${`Consumo interno · ${order[0].professionalName ?? "profissional"}`}, ${orderId}
        )
      `;
      return null;
    }
    if (own) return "fora";
    if (order[0].incomplete) return "cadastro";
    const lines = await tx<{ kind: string; professionalId: string | null; appointmentId: string | null; priceCents: number }[]>`
      SELECT kind, professional_id AS "professionalId", appointment_id AS "appointmentId", price_cents AS "priceCents"
      FROM order_lines WHERE order_id = ${orderId}
    `;
    if (!lines.length) return "vazia";
    if (lines.some((line) => line.kind === "servico" && (!line.professionalId || !line.appointmentId))) return "falta";
    const total = lines.reduce((sum, line) => sum + line.priceCents, 0);
    const paid = await tx<{ amount: number }[]>`
      SELECT COALESCE(SUM(amount_cents), 0)::int AS amount FROM payments WHERE order_id = ${orderId}
    `;
    if ((paid[0]?.amount ?? 0) < total) return "pagamento";
    await tx`UPDATE orders SET status = 'fechada' WHERE id = ${orderId}`;
    const visits = await tx<{ id: string }[]>`
      SELECT id FROM appointments
      WHERE order_id = ${orderId} AND account_id = ${user.accountId} AND status NOT IN ('cancelado', 'ausente')
    `;
    await tx`
      UPDATE appointments SET status = 'realizado'
      WHERE order_id = ${orderId} AND status NOT IN ('cancelado', 'ausente')
    `;
    for (const visit of visits) await applyServiceUse(tx, user.accountId, visit.id, user.id);
    return null;
  });
  const day = await db()<{ day: string }[]>`
    SELECT to_char(day, 'YYYY-MM-DD') AS day FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
  `;
  const { redirect } = await import("next/navigation");
  if (stay && day[0]) redirect(fail ? `/agenda?dia=${day[0].day}&erro=${fail}` : `/agenda?dia=${day[0].day}`);
  redirect(fail ? `/comandas/${orderId}?erro=${fail}` : `/comandas/${orderId}`);
}

export async function reopenOrder(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  const stay = formData.get("voltar") === "agenda";
  const own = await scope(user.id, user.role);
  const rows = await db().begin(async (tx) => {
    const order = await tx<{ day: string; kind: string; professionalId: string | null; status: string }[]>`
      SELECT to_char(day, 'YYYY-MM-DD') AS day, kind, professional_id AS "professionalId", status
      FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
    `;
    if (!order[0] || order[0].status !== "fechada") return order as { day: string }[];
    if (own && (order[0].kind !== "consumo" || order[0].professionalId !== own)) return [] as { day: string }[];
    await tx`
      UPDATE orders SET status = 'aberta'
      WHERE id = ${orderId} AND account_id = ${user.accountId}
    `;
    await tx`
      DELETE FROM cash_movements
      WHERE order_id = ${orderId} AND account_id = ${user.accountId} AND origin = 'consumo_interno'
    `;
    return [{ day: order[0].day }];
  });
  const { redirect } = await import("next/navigation");
  if (!rows[0]) redirect(`/comandas/${orderId}?erro=fora`);
  if (stay) redirect(`/agenda?dia=${rows[0].day}`);
  redirect(`/comandas/${orderId}`);
}

export async function attachClient(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const existingId = String(formData.get("client") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const phone = digits(String(formData.get("phone") ?? ""));
    const fromOutside = checked(formData, "from_outside");
    const next = await db().begin(async (tx) => {
      const order = await tx<{ day: string; status: string }[]>`
        SELECT to_char(day, 'YYYY-MM-DD') AS day, status
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId} AND incomplete
      `;
      if (!order[0] || order[0].status !== "aberta") throw new FormError("fechada");
      let clientId = idOrNull(existingId);
      if (!clientId) {
        if (name.length < 2 || phone.length < 8) throw new FormError("dados");
        clientId = randomUUID();
        await tx`
          INSERT INTO clients (id, account_id, name, phone, channel, from_outside)
          VALUES (${clientId}, ${user.accountId}, ${name}, ${phone}, 'nao_informado', ${fromOutside})
        `;
      } else {
        const owned = await tx`SELECT id FROM clients WHERE id = ${clientId} AND account_id = ${user.accountId}`;
        if (!owned.length) throw new FormError("cliente");
        if (fromOutside) {
          await tx`
            UPDATE clients SET from_outside = true
            WHERE id = ${clientId} AND account_id = ${user.accountId}
          `;
        }
      }
      const other = await tx<{ id: string; status: string }[]>`
        SELECT id, status FROM orders
        WHERE account_id = ${user.accountId} AND client_id = ${clientId} AND day = ${order[0].day}
          AND kind = 'cliente' AND id <> ${orderId}
      `;
      if (other[0]?.status === "fechada") throw new FormError("fechada");
      if (other[0]) {
        await tx`UPDATE order_lines SET order_id = ${other[0].id} WHERE order_id = ${orderId}`;
        await tx`UPDATE payments SET order_id = ${other[0].id} WHERE order_id = ${orderId}`;
        await tx`UPDATE cash_movements SET order_id = ${other[0].id} WHERE order_id = ${orderId}`;
        await tx`UPDATE appointments SET order_id = ${other[0].id}, client_id = ${clientId} WHERE order_id = ${orderId}`;
        await tx`DELETE FROM orders WHERE id = ${orderId}`;
        await restampOrder(tx, user.accountId, other[0].id);
        return other[0].id;
      }
      await tx`
        UPDATE orders SET client_id = ${clientId}, incomplete = false WHERE id = ${orderId}
      `;
      await tx`UPDATE appointments SET client_id = ${clientId} WHERE order_id = ${orderId}`;
      await restampOrder(tx, user.accountId, orderId);
      return orderId;
    });
    return `/comandas/${next}`;
  });
}

export async function changeClient(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const clientId = idOrNull(String(formData.get("client") ?? ""));
    if (!clientId) throw new FormError("cliente");
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string; clientId: string | null; clientName: string | null; day: string }[]>`
        SELECT o.status, o.kind, o.client_id AS "clientId", c.name AS "clientName",
               to_char(o.day, 'YYYY-MM-DD') AS day
        FROM orders o
        LEFT JOIN clients c ON c.id = o.client_id
        WHERE o.id = ${orderId} AND o.account_id = ${user.accountId}
      `;
      if (!order[0] || order[0].status !== "aberta" || order[0].kind !== "cliente" || !order[0].clientId) {
        throw new FormError("fechada");
      }
      if (order[0].clientId === clientId) return;
      const next = await tx<{ name: string }[]>`
        SELECT name FROM clients
        WHERE id = ${clientId} AND account_id = ${user.accountId} AND active
      `;
      if (!next[0]) throw new FormError("cliente");
      const packed = await tx`
        SELECT id FROM client_packages WHERE account_id = ${user.accountId} AND order_id = ${orderId}
        UNION ALL
        SELECT id FROM order_lines
        WHERE order_id = ${orderId} AND (package_credit_id IS NOT NULL OR kind = 'pacote')
        LIMIT 1
      `;
      if (packed.length) throw new FormError("troca");
      const other = await tx`
        SELECT id FROM orders
        WHERE account_id = ${user.accountId} AND client_id = ${clientId}
          AND day = ${order[0].day} AND kind = 'cliente' AND id <> ${orderId}
      `;
      if (other.length) throw new FormError("dia");
      await tx`UPDATE orders SET client_id = ${clientId}, incomplete = false WHERE id = ${orderId}`;
      await tx`UPDATE appointments SET client_id = ${clientId} WHERE order_id = ${orderId} AND account_id = ${user.accountId}`;
      await restampOrder(tx, user.accountId, orderId);
      await writeEvent(tx, {
        accountId: user.accountId,
        orderId,
        lineId: null,
        appointmentId: null,
        actorId: user.id,
        kind: "cliente",
        summary: `Cliente: ${order[0].clientName ?? "Sem nome"} → ${next[0].name}.`,
        beforeCents: null,
        afterCents: null,
      });
    });
    return `/comandas/${orderId}`;
  });
}

export async function openConsumption(formData: FormData) {
  const user = await requireDesk();
  const day = dayParam(String(formData.get("day") ?? ""));
  const own = await scope(user.id, user.role);
  const professionalId = own ?? idOrNull(String(formData.get("professional") ?? ""));
  if (!professionalId) {
    const { redirect } = await import("next/navigation");
    redirect(`/agenda?dia=${day}&erro=dados`);
  }
  const existing = await db()<{ id: string }[]>`
    SELECT id FROM orders
    WHERE account_id = ${user.accountId} AND professional_id = ${professionalId}
      AND day = ${day} AND kind = 'consumo'
  `;
  if (existing[0]) {
    const { redirect } = await import("next/navigation");
    redirect(`/comandas/${existing[0].id}`);
  }
  const id = randomUUID();
  await db()`
    INSERT INTO orders (id, account_id, professional_id, day, kind, status)
    VALUES (${id}, ${user.accountId}, ${professionalId}, ${day}, 'consumo', 'aberta')
  `;
  const { redirect } = await import("next/navigation");
  redirect(`/comandas/${id}`);
}

export async function addConsumption(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const productId = String(formData.get("product") ?? "");
    const own = await scope(user.id, user.role);
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string; professionalId: string }[]>`
        SELECT status, kind, professional_id AS "professionalId"
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.kind !== "consumo" || order[0].status !== "aberta") throw new FormError("fechada");
      if (own && order[0].professionalId !== own) throw new FormError("fora");
      const product = await tx<{ name: string; salePriceCents: number; staffPriceCents: number | null }[]>`
        SELECT name, sale_price_cents AS "salePriceCents", staff_price_cents AS "staffPriceCents"
        FROM products WHERE id = ${productId} AND account_id = ${user.accountId}
      `;
      const house = await tx<{ consumption: number }[]>`
        SELECT staff_consumption_percent AS consumption FROM accounts WHERE id = ${user.accountId}
      `;
      if (!product[0]) throw new FormError("estoque");
      const abatement = staffPriceCents(product[0].salePriceCents, product[0].staffPriceCents, house[0]?.consumption ?? 30);
      await tx`
        INSERT INTO order_lines (
          id, account_id, order_id, kind, product_id, professional_id, description, qty,
          price_cents, list_price_cents, commission_percent, commission_cents, abatement_cents
        ) VALUES (
          ${randomUUID()}, ${user.accountId}, ${orderId}, 'produto', ${productId}, ${order[0].professionalId},
          ${product[0].name}, 1, 0, ${product[0].salePriceCents}, 0, 0, ${abatement}
        )
      `;
      await tx`
        INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by)
        VALUES (${randomUUID()}, ${user.accountId}, ${productId}, -1, 'consumo', ${"consumo interno"}, ${user.id})
      `;
    });
    return `/comandas/${orderId}`;
  });
}

export async function addStaffService(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const professionalId = idOrNull(String(formData.get("professional") ?? ""));
    const serviceId = idOrNull(String(formData.get("service") ?? ""));
    if (!professionalId || !serviceId) throw new FormError("dados");
    const own = await scope(user.id, user.role);
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string; professionalId: string }[]>`
        SELECT status, kind, professional_id AS "professionalId"
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.kind !== "consumo" || order[0].status !== "aberta") throw new FormError("fechada");
      if (own && order[0].professionalId !== own) throw new FormError("fora");
      if (professionalId === order[0].professionalId) throw new FormError("mesmo");
      const offer = await tx<{ name: string; priceCents: number; commissionPercent: number }[]>`
        SELECT s.name,
               COALESCE(ps.price_cents, s.price_cents) AS "priceCents",
               COALESCE(ps.commission_percent, s.commission_percent) AS "commissionPercent"
        FROM services s
        JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = ${professionalId}
        JOIN professionals p ON p.id = ${professionalId} AND p.account_id = ${user.accountId} AND p.active
        WHERE s.id = ${serviceId} AND s.account_id = ${user.accountId} AND s.active
      `;
      if (!offer[0]) throw new FormError("servico");
      const house = await tx<{ discount: number }[]>`
        SELECT staff_service_discount_percent AS discount FROM accounts WHERE id = ${user.accountId}
      `;
      const discount = house[0]?.discount ?? 0;
      const base = Math.max(0, Math.round(offer[0].priceCents * (100 - discount) / 100));
      const commission = Math.round(base * offer[0].commissionPercent / 100);
      await tx`
        INSERT INTO order_lines (
          id, account_id, order_id, kind, service_id, professional_id, description, qty,
          price_cents, list_price_cents, commission_percent, commission_cents, abatement_cents
        ) VALUES (
          ${randomUUID()}, ${user.accountId}, ${orderId}, 'servico', ${serviceId}, ${professionalId},
          ${offer[0].name}, 1, 0, ${offer[0].priceCents}, ${offer[0].commissionPercent}, ${commission}, ${base}
        )
      `;
    });
    return `/comandas/${orderId}`;
  });
}

export async function setClientChannel(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const clientId = idOrNull(String(formData.get("client") ?? ""));
    const channel = String(formData.get("channel") ?? "");
    if (!clientId || !CHANNEL_VALUES.has(channel) || channel === "nao_informado") throw new FormError("dados");
    let professionalId = idOrNull(String(formData.get("referrer_professional") ?? ""));
    let referrerClientId = idOrNull(String(formData.get("referrer_client") ?? ""));
    const commissionRaw = String(formData.get("referral_commission") ?? "").trim();
    let commission = commissionRaw ? parsePercent(formData.get("referral_commission")) : null;
    if (commissionRaw && commission == null) throw new FormError("dados");
    if (channel !== "indicacao") {
      professionalId = null;
      referrerClientId = null;
      commission = null;
    } else if (Boolean(professionalId) === Boolean(referrerClientId)) {
      throw new FormError("quem");
    }
    await db().begin(async (tx) => {
      const order = await tx<{ status: string }[]>`
        SELECT status FROM orders
        WHERE id = ${orderId} AND account_id = ${user.accountId} AND client_id = ${clientId} AND kind = 'cliente'
      `;
      if (!order[0]) throw new FormError("fora");
      if (order[0].status !== "aberta") throw new FormError("fechada");
      if (professionalId) {
        const found = await tx`SELECT id FROM professionals WHERE id = ${professionalId} AND account_id = ${user.accountId}`;
        if (!found.length) throw new FormError("quem");
      }
      if (referrerClientId) {
        if (referrerClientId === clientId) throw new FormError("quem");
        const found = await tx`SELECT id FROM clients WHERE id = ${referrerClientId} AND account_id = ${user.accountId}`;
        if (!found.length) throw new FormError("quem");
      }
      await tx`
        UPDATE clients SET
          channel = ${channel},
          referrer_professional_id = ${professionalId},
          referrer_client_id = ${referrerClientId},
          referral_commission_percent = ${commission}
        WHERE id = ${clientId} AND account_id = ${user.accountId}
      `;
      await restampOrder(tx, user.accountId, orderId);
    });
    return `/comandas/${orderId}`;
  });
}

export async function toggleFromOutside(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  const clientId = idOrNull(String(formData.get("client") ?? ""));
  if (clientId) {
    await db()`
      UPDATE clients SET from_outside = NOT from_outside
      WHERE id = ${clientId} AND account_id = ${user.accountId}
    `;
  }
  const { redirect } = await import("next/navigation");
  redirect(`/comandas/${orderId}`);
}

function fail(code: string) {
  return { ok: false as const, error: FORM_ERRORS[code] ?? "Não deu para concluir." };
}

async function markAttendance(tx: TransactionSql, accountId: string, appointmentId: string, status: string) {
  await tx`
    UPDATE appointments
    SET status = ${status},
        arrived_at = CASE
          WHEN ${status} = 'chegou' AND arrived_at IS NULL AND started_at IS NULL THEN now()
          ELSE arrived_at
        END,
        started_at = CASE
          WHEN ${status} = 'em_atendimento' AND started_at IS NULL THEN now()
          ELSE started_at
        END
    WHERE id = ${appointmentId} AND account_id = ${accountId} AND kind = 'horario'
  `;
}

async function writeEvent(
  tx: TransactionSql,
  input: {
    accountId: string;
    orderId: string | null;
    lineId: string | null;
    appointmentId: string | null;
    actorId: string;
    kind: "valor" | "cancelamento" | "cliente";
    summary: string;
    beforeCents: number | null;
    afterCents: number | null;
  },
) {
  await tx`
    INSERT INTO order_events (
      id, account_id, order_id, line_id, appointment_id, actor_id, kind, summary, before_cents, after_cents
    ) VALUES (
      ${randomUUID()}, ${input.accountId}, ${input.orderId}, ${input.lineId}, ${input.appointmentId},
      ${input.actorId}, ${input.kind}, ${input.summary}, ${input.beforeCents}, ${input.afterCents}
    )
  `;
}

async function logCancellation(tx: TransactionSql, actorId: string, accountId: string, appointmentId: string) {
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
  await writeEvent(tx, {
    accountId,
    orderId: line?.orderId ?? null,
    lineId: line?.id ?? null,
    appointmentId,
    actorId,
    kind: "cancelamento",
    summary: line ? `${line.description}${when} cancelado` : "Horário cancelado",
    beforeCents: line?.priceCents ?? null,
    afterCents: null,
  });
}

export async function placeAppointment(input: {
  id: string;
  professionalId: string;
  start: string;
  end: string;
}) {
  const user = await requireDesk();
  const id = idOrNull(input.id);
  const professionalId = idOrNull(input.professionalId);
  if (!id || !professionalId || !TIME.test(input.start) || !TIME.test(input.end)) return fail("dados");
  const length = minutes(input.end) - minutes(input.start);
  if (length < 15 || minutes(input.end) >= 24 * 60) return fail("hora");
  try {
    const own = await scope(user.id, user.role);
    if (own && own !== professionalId) return fail("fora");
    await db().begin(async (tx) => {
      const rows = await tx<{
        serviceId: string | null;
        encaixe: boolean;
        kind: string;
        orderStatus: string | null;
        day: string;
        professionalId: string;
      }[]>`
        SELECT a.service_id AS "serviceId", a.encaixe, a.kind, o.status AS "orderStatus",
               to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
               a.professional_id AS "professionalId"
        FROM appointments a
        LEFT JOIN orders o ON o.id = a.order_id
        WHERE a.id = ${id} AND a.account_id = ${user.accountId}
      `;
      const row = rows[0];
      if (!row) throw new FormError("fora");
      if (own && own !== row.professionalId) throw new FormError("fora");
      if (row.orderStatus === "fechada") throw new FormError("fechada");
      const startsAt = stamp(row.day, input.start);
      const endsAt = stamp(row.day, input.end);
      if (row.kind === "horario" && row.serviceId && professionalId !== row.professionalId) {
        const offer = await tx`
          SELECT 1 FROM professional_services
          WHERE professional_id = ${professionalId} AND service_id = ${row.serviceId}
        `;
        if (!offer.length) throw new FormError("servico");
      }
      if (row.kind === "horario" && !row.encaixe) {
        const hours = await tx<{ weekday: number; period: number; startTime: string; endTime: string; validFrom: string | null; validUntil: string | null }[]>`
          SELECT weekday, period, start_time AS "startTime", end_time AS "endTime",
                 to_char(valid_from, 'YYYY-MM-DD') AS "validFrom",
                 to_char(valid_until, 'YYYY-MM-DD') AS "validUntil"
          FROM professional_hours WHERE professional_id = ${professionalId}
        `;
        const issue = placementIssue(periodsFor(hours, row.day), input.start, input.end);
        if (issue) throw new FormError(issue);
        const clash = await tx`
          SELECT id FROM appointments
          WHERE professional_id = ${professionalId}
            AND id <> ${id}
            AND status <> 'cancelado'
            AND starts_at < ${endsAt}
            AND ends_at > ${startsAt}
        `;
        if (clash.length) throw new FormError("ocupado");
      }
      await tx`
        UPDATE appointments
        SET professional_id = ${professionalId}, starts_at = ${startsAt}, ends_at = ${endsAt}
        WHERE id = ${id}
      `;
      await tx`
        UPDATE order_lines SET professional_id = ${professionalId}
        WHERE appointment_id = ${id} AND account_id = ${user.accountId}
      `;
    });
  } catch (error) {
    if (error instanceof FormError) return fail(error.code);
    throw error;
  }
  return { ok: true as const };
}

export async function paintSlot(input: { id: string; status: string }) {
  const user = await requireDesk();
  const id = idOrNull(input.id);
  if (!id || !STATUSES.includes(input.status)) return fail("dados");
  try {
    const own = await scope(user.id, user.role);
    await db().begin(async (tx) => {
      const rows = await tx<{ professionalId: string; orderStatus: string | null }[]>`
        SELECT a.professional_id AS "professionalId", o.status AS "orderStatus"
        FROM appointments a
        LEFT JOIN orders o ON o.id = a.order_id
        WHERE a.id = ${id} AND a.account_id = ${user.accountId} AND a.kind = 'horario'
      `;
      if (!rows[0]) throw new FormError("fora");
      if (own && own !== rows[0].professionalId) throw new FormError("fora");
      if (input.status === "cancelado") {
        if (rows[0].orderStatus === "fechada") throw new FormError("fechada");
        await logCancellation(tx, user.id, user.accountId, id);
        await releasePackageVisits(tx, user.accountId, id);
        await tx`UPDATE appointments SET status = 'cancelado' WHERE id = ${id}`;
        await applyServiceUse(tx, user.accountId, id, user.id);
        await tx`DELETE FROM order_lines WHERE appointment_id = ${id} AND account_id = ${user.accountId}`;
      } else {
        await markAttendance(tx, user.accountId, id, input.status);
        if (input.status === "realizado") await finishPackageVisit(tx, user.accountId, id);
        await applyServiceUse(tx, user.accountId, id, user.id);
      }
    });
    if (input.status === "cancelado") {
      const slot = await db()<{ day: string; serviceId: string | null; professionalId: string }[]>`
        SELECT to_char(starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
               service_id AS "serviceId", professional_id AS "professionalId"
        FROM appointments WHERE id = ${id} AND account_id = ${user.accountId}
      `;
      if (slot[0]) {
        const { promoteWaitlistOnCancel } = await import("@/agent/waitlist");
        await promoteWaitlistOnCancel(user.accountId, {
          day: slot[0].day,
          serviceId: slot[0].serviceId,
          professionalId: slot[0].professionalId,
        });
      }
    }
  } catch (error) {
    if (error instanceof FormError) return fail(error.code);
    throw error;
  }
  return { ok: true as const };
}

export async function flipEncaixe(input: { id: string }) {
  const user = await requireDesk();
  const id = idOrNull(input.id);
  if (!id) return fail("dados");
  await db()`
    UPDATE appointments SET encaixe = NOT encaixe
    WHERE id = ${id} AND account_id = ${user.accountId} AND kind = 'horario'
  `;
  return { ok: true as const };
}

export async function dropBlock(input: { id: string }) {
  const user = await requireDesk();
  const id = idOrNull(input.id);
  if (!id) return fail("dados");
  const own = await scope(user.id, user.role);
  await db()`
    DELETE FROM appointments
    WHERE id = ${id} AND account_id = ${user.accountId} AND kind = 'bloqueio'
      AND (${own}::uuid IS NULL OR professional_id = ${own})
  `;
  return { ok: true as const };
}

export async function addServiceToOrder(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const professionalId = idOrNull(String(formData.get("professional") ?? ""));
    const serviceId = idOrNull(String(formData.get("service") ?? ""));
    const start = String(formData.get("start") ?? "");
    const encaixe = formData.get("encaixe") === "1";
    if (!professionalId || !serviceId || !TIME.test(start)) throw new FormError("dados");
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string; clientId: string | null; day: string }[]>`
        SELECT status, kind, client_id AS "clientId", to_char(day, 'YYYY-MM-DD') AS day
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta" || order[0].kind !== "cliente") throw new FormError("fechada");
      const offer = await tx<{ durationMin: number; priceCents: number; commissionPercent: number; name: string }[]>`
        SELECT COALESCE(ps.duration_min, s.duration_min) AS "durationMin",
               COALESCE(ps.price_cents, s.price_cents) AS "priceCents",
               COALESCE(ps.commission_percent, s.commission_percent) AS "commissionPercent",
               s.name
        FROM services s
        JOIN professional_services ps ON ps.service_id = s.id AND ps.professional_id = ${professionalId}
        WHERE s.id = ${serviceId} AND s.account_id = ${user.accountId} AND s.active
      `;
      if (!offer[0]) throw new FormError("servico");
      const end = addMinutes(start, offer[0].durationMin);
      if (minutes(end) >= 24 * 60) throw new FormError("hora");
      const startsAt = stamp(order[0].day, start);
      const endsAt = stamp(order[0].day, end);
      if (!encaixe) {
        const hours = await tx<{ weekday: number; period: number; startTime: string; endTime: string; validFrom: string | null; validUntil: string | null }[]>`
          SELECT weekday, period, start_time AS "startTime", end_time AS "endTime",
                 to_char(valid_from, 'YYYY-MM-DD') AS "validFrom",
                 to_char(valid_until, 'YYYY-MM-DD') AS "validUntil"
          FROM professional_hours WHERE professional_id = ${professionalId}
        `;
        const issue = placementIssue(periodsFor(hours, order[0].day), start, end);
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
      const appointmentId = randomUUID();
      const lineId = randomUUID();
      const sheet = offer[0].priceCents;
      const price = await chargedServicePrice(tx, serviceId, order[0].day, start, sheet);
      const commission = Math.round(price * offer[0].commissionPercent / 100);
      await tx`
        INSERT INTO appointments (
          id, account_id, professional_id, client_id, service_id, order_id,
          starts_at, ends_at, status, encaixe, kind
        ) VALUES (
          ${appointmentId}, ${user.accountId}, ${professionalId}, ${order[0].clientId}, ${serviceId}, ${orderId},
          ${startsAt}, ${endsAt}, 'agendado', ${encaixe}, 'horario'
        )
      `;
      await tx`
        INSERT INTO order_lines (
          id, account_id, order_id, appointment_id, kind, service_id, professional_id,
          description, qty, price_cents, list_price_cents, commission_percent, commission_cents
        ) VALUES (
          ${lineId}, ${user.accountId}, ${orderId}, ${appointmentId}, 'servico', ${serviceId}, ${professionalId},
          ${offer[0].name}, 1, ${price}, ${sheet}, ${offer[0].commissionPercent}, ${commission}
        )
      `;
      await stampReferral(tx, user.accountId, orderId, lineId, price);
    });
    return `/comandas/${orderId}`;
  });
}

export async function removeLine(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  const lineId = idOrNull(String(formData.get("line") ?? ""));
  return settle(`/comandas/${orderId}`, async () => {
    if (!lineId) throw new FormError("dados");
    const own = await scope(user.id, user.role);
    const next = await db().begin(async (tx) => {
      const order = await tx<{ status: string; incomplete: boolean; day: string; kind: string; professionalId: string | null }[]>`
        SELECT status, incomplete, to_char(day, 'YYYY-MM-DD') AS day, kind, professional_id AS "professionalId"
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta") throw new FormError("fechada");
      if (own && order[0].kind === "consumo" && order[0].professionalId !== own) throw new FormError("fora");
      const line = await tx<{
        kind: string;
        description: string;
        priceCents: number;
        productId: string | null;
        qty: number;
        appointmentId: string | null;
        packageCreditId: string | null;
        start: string | null;
        end: string | null;
      }[]>`
        SELECT l.kind, l.description, l.price_cents AS "priceCents", l.product_id AS "productId", l.qty,
               l.appointment_id AS "appointmentId", l.package_credit_id AS "packageCreditId",
               to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
               to_char(a.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS "end"
        FROM order_lines l
        LEFT JOIN appointments a ON a.id = l.appointment_id
        WHERE l.id = ${lineId} AND l.order_id = ${orderId}
      `;
      if (!line[0]) throw new FormError("fora");
      if (line[0].kind === "pacote") {
        const held = await tx<{ id: string; packageId: string | null }[]>`
          SELECT id, package_id AS "packageId" FROM client_packages WHERE order_line_id = ${lineId}
        `;
        if (held[0]) {
          const used = await tx<{ lineId: string | null; orderId: string | null }[]>`
            SELECT c.order_line_id AS "lineId", l.order_id AS "orderId"
            FROM package_credits c
            LEFT JOIN order_lines l ON l.id = c.order_line_id
            WHERE c.client_package_id = ${held[0].id} AND c.status = 'usado'
          `;
          if (used.some((credit) => credit.orderId && credit.orderId !== orderId)) throw new FormError("outra");
          for (const credit of used) {
            if (!credit.lineId || credit.orderId !== orderId) continue;
            const restored = await tx<{ listPriceCents: number; commissionPercent: number; description: string }[]>`
              SELECT list_price_cents AS "listPriceCents", commission_percent AS "commissionPercent", description
              FROM order_lines WHERE id = ${credit.lineId}
            `;
            if (!restored[0]) continue;
            const prior = await tx<{ beforeCents: number | null }[]>`
              SELECT before_cents AS "beforeCents"
              FROM order_events
              WHERE line_id = ${credit.lineId} AND kind = 'valor' AND summary LIKE 'Abateu %'
              ORDER BY created_at DESC
              LIMIT 1
            `;
            const price = prior[0]?.beforeCents ?? restored[0].listPriceCents;
            const commission = Math.round(price * restored[0].commissionPercent / 100);
            await tx`
              UPDATE order_lines
              SET price_cents = ${price}, commission_cents = ${commission}, package_credit_id = NULL, courtesy = false
              WHERE id = ${credit.lineId}
            `;
            await stampReferral(tx, user.accountId, orderId, credit.lineId, price);
            await writeEvent(tx, {
              accountId: user.accountId,
              orderId,
              lineId: credit.lineId,
              appointmentId: null,
              actorId: user.id,
              kind: "valor",
              summary: `Desfez o abate de ${restored[0].description}. Voltou a ${formatReais(price)}. Comissão ${formatReais(commission)}.`,
              beforeCents: 0,
              afterCents: price,
            });
          }
          if (held[0].packageId) {
            const products = await tx<{ productId: string; qty: number }[]>`
              SELECT product_id AS "productId", qty FROM package_items
              WHERE package_id = ${held[0].packageId} AND kind = 'product'
            `;
            for (const product of products) {
              await tx`
                INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by)
                VALUES (
                  ${randomUUID()}, ${user.accountId}, ${product.productId}, ${product.qty}, 'ajuste',
                  ${"estorno do pacote"}, ${user.id}
                )
              `;
            }
          }
          await tx`DELETE FROM client_packages WHERE id = ${held[0].id}`;
        }
      }
      if (line[0].packageCreditId) {
        const credit = await tx<{ clientPackageId: string }[]>`
          SELECT client_package_id AS "clientPackageId" FROM package_credits WHERE id = ${line[0].packageCreditId}
        `;
        await tx`
          UPDATE package_credits
          SET status = 'falta_agendar', order_line_id = NULL, appointment_id = NULL, used_on = NULL
          WHERE id = ${line[0].packageCreditId}
        `;
        if (credit[0]) {
          const still = await tx`SELECT 1 FROM package_credits WHERE client_package_id = ${credit[0].clientPackageId} AND status = 'usado'`;
          if (!still.length) {
            await tx`
              UPDATE client_packages
              SET status = 'ativo', first_used_on = NULL, valid_until = NULL
              WHERE id = ${credit[0].clientPackageId}
            `;
          } else {
            await tx`UPDATE client_packages SET status = 'ativo' WHERE id = ${credit[0].clientPackageId}`;
          }
        }
      }
      const when = line[0].start && line[0].end ? ` ${line[0].start}–${line[0].end}` : "";
      await writeEvent(tx, {
        accountId: user.accountId,
        orderId,
        lineId,
        appointmentId: line[0].appointmentId,
        actorId: user.id,
        kind: "cancelamento",
        summary: line[0].appointmentId
          ? `${line[0].description}${when} cancelado`
          : `${line[0].description} excluído`,
        beforeCents: line[0].priceCents,
        afterCents: null,
      });
      if (line[0].productId) {
        const tied = await tx`SELECT id FROM stock_movements WHERE line_id = ${lineId} LIMIT 1`;
        if (!tied.length) {
          await tx`
            INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by)
            VALUES (
              ${randomUUID()}, ${user.accountId}, ${line[0].productId}, ${line[0].qty}, 'ajuste',
              ${"estorno da comanda"}, ${user.id}
            )
          `;
        }
      }
      await tx`DELETE FROM order_lines WHERE id = ${lineId}`;
      if (line[0].appointmentId) {
        await tx`
          UPDATE appointments SET status = 'cancelado'
          WHERE id = ${line[0].appointmentId} AND account_id = ${user.accountId}
        `;
        await applyServiceUse(tx, user.accountId, line[0].appointmentId, user.id);
      }
      const left = await tx`SELECT id FROM order_lines WHERE order_id = ${orderId} LIMIT 1`;
      const paid = await tx`SELECT id FROM payments WHERE order_id = ${orderId} LIMIT 1`;
      if (order[0].incomplete && !left.length && !paid.length) {
        await tx`
          DELETE FROM appointments
          WHERE order_id = ${orderId} AND account_id = ${user.accountId} AND status = 'cancelado'
        `;
        await tx`DELETE FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}`;
        return `/comandas?dia=${order[0].day}`;
      }
      return `/comandas/${orderId}`;
    });
    return next;
  });
}

export async function openDayOrder(formData: FormData) {
  const user = await requireOperator();
  const day = dayParam(String(formData.get("day") ?? ""));
  const clientId = idOrNull(String(formData.get("client") ?? ""));
  const failBase = formData.get("from") === "cliente" && clientId ? `/clientes/${clientId}` : `/comandas?dia=${day}`;
  return settle(failBase, async () => {
    if (!clientId) throw new FormError("cliente");
    const id = await db().begin(async (tx) => {
      const owned = await tx`
        SELECT id FROM clients
        WHERE id = ${clientId} AND account_id = ${user.accountId} AND active
      `;
      if (!owned.length) throw new FormError("cliente");
      const existing = await tx<{ id: string; status: string }[]>`
        SELECT id, status FROM orders
        WHERE account_id = ${user.accountId} AND client_id = ${clientId} AND day = ${day} AND kind = 'cliente'
      `;
      if (existing[0]?.status === "fechada") throw new FormError("fechada");
      if (existing[0]) return existing[0].id;
      const orderId = randomUUID();
      await tx`
        INSERT INTO orders (id, account_id, client_id, day, kind, status)
        VALUES (${orderId}, ${user.accountId}, ${clientId}, ${day}, 'cliente', 'aberta')
      `;
      return orderId;
    });
    return `/comandas/${id}`;
  });
}

export async function deleteEmptyOrder(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  const backRaw = String(formData.get("back") ?? "");
  const back =
    backRaw.startsWith("/comandas?lista=abertas") ||
    backRaw.startsWith("/comandas?dia=") ||
    backRaw.startsWith(`/comandas/${orderId}`)
      ? backRaw.slice(0, 120)
      : null;
  return settle(back ?? `/comandas/${orderId}`, async () => {
    const own = await scope(user.id, user.role);
    const day = await db().begin(async (tx) => {
      const order = await tx<{ status: string; day: string; kind: string; professionalId: string | null }[]>`
        SELECT status, to_char(day, 'YYYY-MM-DD') AS day, kind, professional_id AS "professionalId"
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta") throw new FormError("fechada");
      if (own && (order[0].kind !== "consumo" || order[0].professionalId !== own)) throw new FormError("fora");
      const left = await tx`SELECT id FROM order_lines WHERE order_id = ${orderId} LIMIT 1`;
      const paid = await tx`SELECT id FROM payments WHERE order_id = ${orderId} LIMIT 1`;
      if (left.length || paid.length) throw new FormError("dados");
      await tx`
        DELETE FROM appointments
        WHERE order_id = ${orderId} AND account_id = ${user.accountId}
      `;
      await tx`DELETE FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}`;
      return order[0].day;
    });
    return back ?? `/comandas?dia=${day}`;
  });
}

export async function moveLineProfessional(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  const lineId = idOrNull(String(formData.get("line") ?? ""));
  const professionalId = idOrNull(String(formData.get("professional") ?? ""));
  return settle(`/comandas/${orderId}`, async () => {
    if (!lineId || !professionalId) throw new FormError("dados");
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string; professionalId: string | null }[]>`
        SELECT status, kind, professional_id AS "professionalId"
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta") throw new FormError("fechada");
      if (order[0].kind === "consumo" && professionalId === order[0].professionalId) throw new FormError("mesmo");
      const line = await tx<{ serviceId: string | null; appointmentId: string | null; packageCreditId: string | null }[]>`
        SELECT service_id AS "serviceId", appointment_id AS "appointmentId", package_credit_id AS "packageCreditId"
        FROM order_lines WHERE id = ${lineId} AND order_id = ${orderId} AND kind = 'servico'
      `;
      if (!line[0]?.serviceId) throw new FormError("dados");
      const offer = await tx<{ commissionPercent: number }[]>`
        SELECT COALESCE(ps.commission_percent, s.commission_percent) AS "commissionPercent"
        FROM professional_services ps
        JOIN services s ON s.id = ps.service_id
        WHERE ps.professional_id = ${professionalId} AND ps.service_id = ${line[0].serviceId}
      `;
      if (!offer.length) throw new FormError("servico");
      if (order[0].kind === "consumo") {
        const current = await tx<{ abatementCents: number }[]>`
          SELECT abatement_cents AS "abatementCents" FROM order_lines WHERE id = ${lineId}
        `;
        const commission = Math.round((current[0]?.abatementCents ?? 0) * offer[0].commissionPercent / 100);
        await tx`
          UPDATE order_lines
          SET professional_id = ${professionalId}, commission_percent = ${offer[0].commissionPercent}, commission_cents = ${commission}
          WHERE id = ${lineId}
        `;
      } else if (line[0].packageCreditId) {
        const credit = await tx<{ internalPriceCents: number }[]>`
          SELECT internal_price_cents AS "internalPriceCents" FROM package_credits WHERE id = ${line[0].packageCreditId}
        `;
        const commission = Math.round((credit[0]?.internalPriceCents ?? 0) * offer[0].commissionPercent / 100);
        await tx`
          UPDATE order_lines
          SET professional_id = ${professionalId}, commission_percent = ${offer[0].commissionPercent}, commission_cents = ${commission}
          WHERE id = ${lineId}
        `;
      } else {
        await tx`UPDATE order_lines SET professional_id = ${professionalId} WHERE id = ${lineId}`;
      }
      if (line[0].appointmentId) {
        await tx`
          UPDATE appointments SET professional_id = ${professionalId}
          WHERE id = ${line[0].appointmentId} AND account_id = ${user.accountId}
        `;
      }
    });
    return `/comandas/${orderId}`;
  });
}

export async function addVisitNote(formData: FormData) {
  const user = await requireDesk();
  const appointmentId = String(formData.get("appointment") ?? "");
  const orderId = String(formData.get("order") ?? "");
  const fail = UUID.test(orderId) ? `/comandas/${orderId}` : "/comandas";
  return settle(fail, async () => {
    const body = String(formData.get("body") ?? "").trim().replace(/\s+/g, " ");
    if (body.length < 2 || body.length > 400) throw new FormError("avaliacao");
    const own = await scope(user.id, user.role);
    const rows = await db()<{ professionalId: string }[]>`
      SELECT professional_id AS "professionalId"
      FROM appointments
      WHERE id = ${appointmentId} AND account_id = ${user.accountId} AND kind = 'horario'
    `;
    if (!rows[0]) throw new FormError("fora");
    if (own && rows[0].professionalId !== own) throw new FormError("fora");
    await db()`
      INSERT INTO visit_notes (id, account_id, appointment_id, body, created_by)
      VALUES (${randomUUID()}, ${user.accountId}, ${appointmentId}, ${body}, ${user.id})
    `;
    return `${fail}?ok=avaliacao`;
  });
}

export async function deleteVisitNote(formData: FormData) {
  const user = await requireOperator();
  const noteId = String(formData.get("note") ?? "");
  const orderId = String(formData.get("order") ?? "");
  const fail = UUID.test(orderId) ? `/comandas/${orderId}` : "/comandas";
  return settle(fail, async () => {
    const gone = await db()`
      DELETE FROM visit_notes WHERE id = ${noteId} AND account_id = ${user.accountId} RETURNING id
    `;
    if (!gone.length) throw new FormError("fora");
    return fail;
  });
}
