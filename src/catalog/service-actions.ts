"use server";

import { randomUUID } from "crypto";
import { requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { checked, parseIntField, parsePercent, parseReais, textOrNull, todaySaoPaulo } from "@/catalog/format";
import { settle } from "@/catalog/settle";
import { db } from "@/db/client";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveService(formData: FormData) {
  const user = await requireOperator();
  const existingId = String(formData.get("id") ?? "");
  const failBase = existingId ? `/servicos/${existingId}` : "/servicos/novo";
  return settle(failBase, async () => {
    const name = String(formData.get("name") ?? "").trim();
    const notes = textOrNull(formData.get("notes"));
    const group = textOrNull(formData.get("group"));
    const duration = parseIntField(formData.get("duration"));
    const price = parseReais(String(formData.get("price") ?? ""));
    const commissionRaw = String(formData.get("commission") ?? "").trim();
    const commission = commissionRaw ? parsePercent(formData.get("commission")) : 0;
    if (name.length < 2 || name.length > 120 || (notes && notes.length > 4000)) throw new FormError("dados");
    if (duration == null || duration < 5 || duration > 480 || price == null || commission == null) {
      throw new FormError("dados");
    }
    const noReturn = checked(formData, "no_return");
    let returnDays: number | null = null;
    if (!noReturn) {
      returnDays = parseIntField(formData.get("return_days"));
      if (returnDays == null || returnDays < 1 || returnDays > 3650) throw new FormError("volta");
    }
    const nextRaw = String(formData.get("next_price") ?? "").trim();
    const nextOn = String(formData.get("next_on") ?? "").trim();
    let nextPrice: number | null = null;
    let nextDate: string | null = null;
    if (nextRaw || nextOn) {
      nextPrice = parseReais(nextRaw);
      if (nextPrice == null || !DATE.test(nextOn) || nextOn < todaySaoPaulo()) throw new FormError("preco");
      nextDate = nextOn;
    }

    const id = await db().begin(async (tx) => {
      let serviceId = existingId;
      if (serviceId) {
        const owned = await tx`SELECT id FROM services WHERE id = ${serviceId} AND account_id = ${user.accountId}`;
        if (!owned.length) throw new FormError("fora");
        await tx`
          UPDATE services SET
            name = ${name},
            notes = ${notes},
            active = ${checked(formData, "active")},
            bookable = ${checked(formData, "bookable")},
            duration_min = ${duration},
            price_cents = ${price},
            commission_percent = ${commission},
            return_days = ${returnDays},
            extras_goal = ${checked(formData, "extras")},
            menu_group = ${group},
            next_price_cents = ${nextPrice},
            next_price_on = ${nextDate}
          WHERE id = ${serviceId}
        `;
      } else {
        serviceId = randomUUID();
        await tx`
          INSERT INTO services (
            id, account_id, name, notes, active, bookable, duration_min, price_cents,
            commission_percent, return_days, extras_goal, menu_group, next_price_cents, next_price_on
          ) VALUES (
            ${serviceId}, ${user.accountId}, ${name}, ${notes}, ${checked(formData, "active")},
            ${checked(formData, "bookable")}, ${duration}, ${price}, ${commission}, ${returnDays},
            ${checked(formData, "extras")}, ${group}, ${nextPrice}, ${nextDate}
          )
        `;
      }

      const dropDiscounts = formData.getAll("drop_discount").map(String).filter(Boolean);
      if (dropDiscounts.length) {
        await tx`
          DELETE FROM service_discounts
          WHERE service_id = ${serviceId} AND id IN ${tx(dropDiscounts)}
        `;
      }
      const weekdayRaw = String(formData.get("new_weekday") ?? "");
      const amountRaw = String(formData.get("new_amount") ?? "").trim();
      const start = String(formData.get("new_start") ?? "").trim();
      const end = String(formData.get("new_end") ?? "").trim();
      if (weekdayRaw || amountRaw || start || end) {
        const weekday = Number(weekdayRaw);
        const mode = String(formData.get("new_mode") ?? "");
        if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw new FormError("desconto");
        if ((start || end) && (!TIME.test(start) || !TIME.test(end) || end <= start)) throw new FormError("desconto");
        let amount: number | null = null;
        if (mode === "percentual") amount = parsePercent(formData.get("new_amount"));
        if (mode === "valor") amount = parseReais(amountRaw);
        if (amount == null || (mode !== "percentual" && mode !== "valor")) throw new FormError("desconto");
        await tx`
          INSERT INTO service_discounts (id, service_id, weekday, start_time, end_time, mode, amount)
          VALUES (${randomUUID()}, ${serviceId}, ${weekday}, ${start || null}, ${end || null}, ${mode}, ${amount})
        `;
      }

      const dropSupplies = formData.getAll("drop_supply").map(String).filter(Boolean);
      if (dropSupplies.length) {
        await tx`
          DELETE FROM service_supplies
          WHERE service_id = ${serviceId} AND product_id IN ${tx(dropSupplies)}
        `;
      }
      const supplyId = String(formData.get("new_supply") ?? "");
      const supplyQtyRaw = String(formData.get("new_supply_qty") ?? "").trim();
      if (supplyId || supplyQtyRaw) {
        const qty = parseIntField(formData.get("new_supply_qty"));
        const product = await tx`
          SELECT id FROM products WHERE id = ${supplyId} AND account_id = ${user.accountId}
        `;
        if (!product.length || qty == null || qty < 1) throw new FormError("insumo");
        await tx`
          INSERT INTO service_supplies (service_id, product_id, qty)
          VALUES (${serviceId}, ${supplyId}, ${qty})
          ON CONFLICT (service_id, product_id) DO UPDATE SET qty = ${qty}
        `;
      }
      return serviceId;
    });
    return `/servicos?ok=salvo`;
  });
}
