"use server";

import { randomUUID } from "crypto";
import type { TransactionSql } from "postgres";
import { requireDesk, requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { digits, formatReais, parseIntField, parsePercent, parseReais, staffPriceCents } from "@/catalog/format";
import { FORM_ERRORS } from "@/catalog/labels";
import { settle } from "@/catalog/settle";
import { db } from "@/db/client";
import { addMinutes, dayParam, minutes, periodsFor, placementIssue, stamp } from "@/desk/clock";
import { linkedProfessional } from "@/desk/queries";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
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
    const own = await scope(user.id, user.role);
    const professionalId = own ?? idOrNull(String(formData.get("professional") ?? ""));
    const serviceId = idOrNull(String(formData.get("service") ?? ""));
    const clientId = idOrNull(String(formData.get("client") ?? ""));
    const start = String(formData.get("start") ?? "");
    const encaixe = formData.get("encaixe") === "1";
    if (!professionalId || !serviceId) throw new FormError("dados");
    if (!TIME.test(start)) throw new FormError("hora");

    const id = await db().begin(async (tx) => {
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

      const discounts = await tx<{ mode: string; amount: number; startTime: string | null; endTime: string | null }[]>`
        SELECT mode, amount, start_time AS "startTime", end_time AS "endTime"
        FROM service_discounts
        WHERE service_id = ${serviceId}
          AND weekday = ${new Date(`${day}T12:00:00-03:00`).getUTCDay()}
      `;
      let price = offer[0].priceCents;
      const hit = discounts.find((discount) => {
        if (!discount.startTime || !discount.endTime) return true;
        const at = minutes(start);
        return minutes(discount.startTime) <= at && at < minutes(discount.endTime);
      });
      if (hit?.mode === "percentual") price = Math.max(0, Math.round(price * (100 - hit.amount) / 100));
      if (hit?.mode === "valor") price = Math.max(0, price - hit.amount);
      const commission = Math.round(price * offer[0].commissionPercent / 100);

      let orderId = "";
      if (clientId) {
        const owned = await tx`SELECT id FROM clients WHERE id = ${clientId} AND account_id = ${user.accountId}`;
        if (!owned.length) throw new FormError("cliente");
        const existing = await tx<{ id: string; status: string }[]>`
          SELECT id, status FROM orders
          WHERE account_id = ${user.accountId} AND client_id = ${clientId} AND day = ${day} AND kind = 'cliente'
        `;
        if (existing[0]?.status === "fechada") throw new FormError("fechada");
        orderId = existing[0]?.id ?? randomUUID();
        if (!existing[0]) {
          await tx`
            INSERT INTO orders (id, account_id, client_id, day, kind, status)
            VALUES (${orderId}, ${user.accountId}, ${clientId}, ${day}, 'cliente', 'aberta')
          `;
        }
      } else {
        orderId = randomUUID();
        await tx`
          INSERT INTO orders (id, account_id, day, kind, status, incomplete)
          VALUES (${orderId}, ${user.accountId}, ${day}, 'cliente', 'aberta', true)
        `;
      }

      const appointmentId = randomUUID();
      await tx`
        INSERT INTO appointments (
          id, account_id, professional_id, client_id, service_id, order_id,
          starts_at, ends_at, status, encaixe, kind
        ) VALUES (
          ${appointmentId}, ${user.accountId}, ${professionalId}, ${clientId || null}, ${serviceId}, ${orderId},
          ${startsAt}, ${endsAt}, 'agendado', ${encaixe}, 'horario'
        )
      `;
      await tx`
        INSERT INTO order_lines (
          id, account_id, order_id, appointment_id, kind, service_id, professional_id,
          description, qty, price_cents, list_price_cents, commission_percent, commission_cents
        ) VALUES (
          ${randomUUID()}, ${user.accountId}, ${orderId}, ${appointmentId}, 'servico', ${serviceId}, ${professionalId},
          ${offer[0].name}, 1, ${price}, ${price}, ${offer[0].commissionPercent}, ${commission}
        )
      `;
      return orderId;
    });
    return `/comandas/${id}`;
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
    await db().begin(async (tx) => {
      await logCancellation(tx, user.id, user.accountId, appointmentId);
      await tx`
        UPDATE appointments SET status = 'cancelado'
        WHERE id = ${appointmentId} AND account_id = ${user.accountId}
      `;
      await tx`DELETE FROM order_lines WHERE appointment_id = ${appointmentId} AND account_id = ${user.accountId}`;
    });
  } else {
    await db()`
      UPDATE appointments SET status = ${status}
      WHERE id = ${appointmentId} AND account_id = ${user.accountId} AND kind = 'horario'
    `;
  }
  const { redirect } = await import("next/navigation");
  redirect(`/comandas/${orderId}`);
}

export async function addProduct(formData: FormData) {
  const user = await requireDesk();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const productId = String(formData.get("product") ?? "");
    const qty = parseIntField(formData.get("qty")) ?? 1;
    const professionalId = String(formData.get("professional") ?? "") || null;
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string }[]>`
        SELECT status, kind FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta" || order[0].kind !== "cliente") throw new FormError("fechada");
      const product = await tx<{ name: string; priceCents: number; commissionPercent: number }[]>`
        SELECT name, sale_price_cents AS "priceCents", commission_percent AS "commissionPercent"
        FROM products
        WHERE id = ${productId} AND account_id = ${user.accountId} AND sells_to_client
      `;
      if (!product[0] || qty < 1) throw new FormError("estoque");
      const price = product[0].priceCents * qty;
      const commission = Math.round(price * product[0].commissionPercent / 100);
      await tx`
        INSERT INTO order_lines (
          id, account_id, order_id, kind, product_id, professional_id, description, qty,
          price_cents, list_price_cents, commission_percent, commission_cents
        ) VALUES (
          ${randomUUID()}, ${user.accountId}, ${orderId}, 'produto', ${productId}, ${professionalId},
          ${product[0].name}, ${qty}, ${price}, ${price}, ${product[0].commissionPercent}, ${commission}
        )
      `;
      await tx`
        INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by)
        VALUES (${randomUUID()}, ${user.accountId}, ${productId}, ${-qty}, 'venda', ${"comanda"}, ${user.id})
      `;
    });
    return `/comandas/${orderId}`;
  });
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
    const line = await tx<{ courtesy: boolean; description: string; priceCents: number; listPriceCents: number; commissionPercent: number }[]>`
      SELECT courtesy, description, price_cents AS "priceCents", list_price_cents AS "listPriceCents",
             commission_percent AS "commissionPercent"
      FROM order_lines WHERE id = ${lineId} AND order_id = ${orderId}
    `;
    if (!line[0]) throw new FormError("dados");
    const courtesy = !line[0].courtesy;
    const price = courtesy ? 0 : line[0].listPriceCents;
    const commission = Math.round(line[0].listPriceCents * line[0].commissionPercent / 100);
    await tx`
      UPDATE order_lines
      SET courtesy = ${courtesy}, price_cents = ${price}, commission_cents = ${commission}
      WHERE id = ${lineId}
    `;
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
      }[]>`
        SELECT description, price_cents AS "priceCents", list_price_cents AS "listPriceCents",
               commission_percent AS "commissionPercent", courtesy, appointment_id AS "appointmentId"
        FROM order_lines WHERE id = ${lineId} AND order_id = ${orderId}
      `;
      if (!line[0]) throw new FormError("fora");
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

export async function addPayment(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const method = String(formData.get("method") ?? "");
    const amount = parseReais(String(formData.get("amount") ?? ""));
    if (!["dinheiro", "pix", "debito", "credito", "outros"].includes(method) || amount == null || amount < 1) {
      throw new FormError("dados");
    }
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; day: string; clientName: string | null }[]>`
        SELECT o.status, to_char(o.day, 'YYYY-MM-DD') AS day, c.name AS "clientName"
        FROM orders o
        LEFT JOIN clients c ON c.id = o.client_id
        WHERE o.id = ${orderId} AND o.account_id = ${user.accountId} AND o.kind = 'cliente'
      `;
      if (order[0]?.status !== "aberta") throw new FormError("fechada");
      const paymentId = randomUUID();
      await tx`
        INSERT INTO payments (id, account_id, order_id, method, amount_cents)
        VALUES (${paymentId}, ${user.accountId}, ${orderId}, ${method}, ${amount})
      `;
      await tx`
        INSERT INTO cash_movements (id, account_id, day, amount_cents, origin, label, payment_id, order_id)
        VALUES (
          ${randomUUID()}, ${user.accountId}, ${order[0].day}, ${amount}, 'pagamento',
          ${order[0].clientName ?? "Sem nome"}, ${paymentId}, ${orderId}
        )
      `;
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
    await tx`DELETE FROM cash_movements WHERE payment_id = ${paymentId} AND account_id = ${user.accountId}`;
    await tx`DELETE FROM payments WHERE id = ${paymentId} AND order_id = ${orderId}`;
  });
  const { redirect } = await import("next/navigation");
  redirect(`/comandas/${orderId}`);
}

export async function closeOrder(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  const fail = await db().begin(async (tx) => {
    const order = await tx<{ status: string; kind: string; day: string; professionalName: string | null }[]>`
      SELECT o.status, o.kind, to_char(o.day, 'YYYY-MM-DD') AS day, p.name AS "professionalName"
      FROM orders o
      LEFT JOIN professionals p ON p.id = o.professional_id
      WHERE o.id = ${orderId} AND o.account_id = ${user.accountId}
    `;
    if (!order[0] || order[0].status !== "aberta") return "fechada";
    if (order[0].kind === "consumo") {
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
    const lines = await tx<{ kind: string; professionalId: string | null; appointmentId: string | null; priceCents: number }[]>`
      SELECT kind, professional_id AS "professionalId", appointment_id AS "appointmentId", price_cents AS "priceCents"
      FROM order_lines WHERE order_id = ${orderId}
    `;
    if (lines.some((line) => line.kind === "servico" && (!line.professionalId || !line.appointmentId))) return "falta";
    const total = lines.reduce((sum, line) => sum + line.priceCents, 0);
    const paid = await tx<{ amount: number }[]>`
      SELECT COALESCE(SUM(amount_cents), 0)::int AS amount FROM payments WHERE order_id = ${orderId}
    `;
    if ((paid[0]?.amount ?? 0) < total) return "pagamento";
    await tx`UPDATE orders SET status = 'fechada' WHERE id = ${orderId}`;
    await tx`
      UPDATE appointments SET status = 'realizado'
      WHERE order_id = ${orderId} AND status NOT IN ('cancelado', 'ausente')
    `;
    return null;
  });
  const { redirect } = await import("next/navigation");
  redirect(fail ? `/comandas/${orderId}?erro=${fail}` : `/comandas/${orderId}`);
}

export async function reopenOrder(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  await db().begin(async (tx) => {
    await tx`
      UPDATE orders SET status = 'aberta'
      WHERE id = ${orderId} AND account_id = ${user.accountId}
    `;
    await tx`
      DELETE FROM cash_movements
      WHERE order_id = ${orderId} AND account_id = ${user.accountId} AND origin = 'consumo_interno'
    `;
  });
  const { redirect } = await import("next/navigation");
  redirect(`/comandas/${orderId}`);
}

export async function attachClient(formData: FormData) {
  const user = await requireOperator();
  const orderId = String(formData.get("order") ?? "");
  return settle(`/comandas/${orderId}`, async () => {
    const existingId = String(formData.get("client") ?? "");
    const name = String(formData.get("name") ?? "").trim();
    const phone = digits(String(formData.get("phone") ?? ""));
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
          INSERT INTO clients (id, account_id, name, phone, channel)
          VALUES (${clientId}, ${user.accountId}, ${name}, ${phone}, 'nao_informado')
        `;
      } else {
        const owned = await tx`SELECT id FROM clients WHERE id = ${clientId} AND account_id = ${user.accountId}`;
        if (!owned.length) throw new FormError("cliente");
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
        return other[0].id;
      }
      await tx`
        UPDATE orders SET client_id = ${clientId}, incomplete = false WHERE id = ${orderId}
      `;
      await tx`UPDATE appointments SET client_id = ${clientId} WHERE order_id = ${orderId}`;
      return orderId;
    });
    return `/comandas/${next}`;
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
    await db().begin(async (tx) => {
      const order = await tx<{ status: string; kind: string; professionalId: string }[]>`
        SELECT status, kind, professional_id AS "professionalId"
        FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.kind !== "consumo" || order[0].status !== "aberta") throw new FormError("fechada");
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

async function writeEvent(
  tx: TransactionSql,
  input: {
    accountId: string;
    orderId: string | null;
    lineId: string | null;
    appointmentId: string | null;
    actorId: string;
    kind: "valor" | "cancelamento";
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
        await tx`UPDATE appointments SET status = 'cancelado' WHERE id = ${id}`;
        await tx`DELETE FROM order_lines WHERE appointment_id = ${id} AND account_id = ${user.accountId}`;
      } else {
        await tx`UPDATE appointments SET status = ${input.status} WHERE id = ${id}`;
      }
    });
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
      const price = offer[0].priceCents;
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
          ${randomUUID()}, ${user.accountId}, ${orderId}, ${appointmentId}, 'servico', ${serviceId}, ${professionalId},
          ${offer[0].name}, 1, ${price}, ${price}, ${offer[0].commissionPercent}, ${commission}
        )
      `;
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
    await db().begin(async (tx) => {
      const order = await tx<{ status: string }[]>`
        SELECT status FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta") throw new FormError("fechada");
      const line = await tx<{
        kind: string;
        description: string;
        priceCents: number;
        productId: string | null;
        qty: number;
        appointmentId: string | null;
        start: string | null;
        end: string | null;
      }[]>`
        SELECT l.kind, l.description, l.price_cents AS "priceCents", l.product_id AS "productId", l.qty,
               l.appointment_id AS "appointmentId",
               to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
               to_char(a.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS "end"
        FROM order_lines l
        LEFT JOIN appointments a ON a.id = l.appointment_id
        WHERE l.id = ${lineId} AND l.order_id = ${orderId}
      `;
      if (!line[0]) throw new FormError("fora");
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
        await tx`
          INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by)
          VALUES (
            ${randomUUID()}, ${user.accountId}, ${line[0].productId}, ${line[0].qty}, 'ajuste',
            ${"estorno da comanda"}, ${user.id}
          )
        `;
      }
      await tx`DELETE FROM order_lines WHERE id = ${lineId}`;
      if (line[0].appointmentId) {
        await tx`
          UPDATE appointments SET status = 'cancelado'
          WHERE id = ${line[0].appointmentId} AND account_id = ${user.accountId}
        `;
      }
    });
    return `/comandas/${orderId}`;
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
      const order = await tx<{ status: string }[]>`
        SELECT status FROM orders WHERE id = ${orderId} AND account_id = ${user.accountId}
      `;
      if (order[0]?.status !== "aberta") throw new FormError("fechada");
      const line = await tx<{ serviceId: string | null; appointmentId: string | null }[]>`
        SELECT service_id AS "serviceId", appointment_id AS "appointmentId"
        FROM order_lines WHERE id = ${lineId} AND order_id = ${orderId} AND kind = 'servico'
      `;
      if (!line[0]?.serviceId) throw new FormError("dados");
      const offer = await tx`
        SELECT 1 FROM professional_services
        WHERE professional_id = ${professionalId} AND service_id = ${line[0].serviceId}
      `;
      if (!offer.length) throw new FormError("servico");
      await tx`UPDATE order_lines SET professional_id = ${professionalId} WHERE id = ${lineId}`;
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
