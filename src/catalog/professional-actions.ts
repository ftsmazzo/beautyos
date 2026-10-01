"use server";

import { randomUUID } from "crypto";
import { requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { checked, digits, parseIntField, parsePercent, parseReais, textOrNull } from "@/catalog/format";
import { readHours } from "@/catalog/hours";
import { settle } from "@/catalog/settle";
import { db } from "@/db/client";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

export async function saveProfessional(formData: FormData) {
  const user = await requireOperator();
  const existingId = String(formData.get("id") ?? "");
  const failBase = existingId ? `/profissionais/${existingId}` : "/profissionais/novo";
  return settle(failBase, async () => {
    const name = String(formData.get("name") ?? "").trim();
    const phone = digits(String(formData.get("phone") ?? ""));
    const email = textOrNull(formData.get("email"));
    const birth = String(formData.get("birth") ?? "").trim();
    const color = String(formData.get("color") ?? "").trim();
    if (name.length < 2 || (phone && phone.length < 8) || (email && !email.includes("@"))) throw new FormError("dados");
    if (birth && !DATE.test(birth)) throw new FormError("dados");
    if (!COLOR.test(color)) throw new FormError("dados");
    const loginId = String(formData.get("login") ?? "");

    const id = await db().begin(async (tx) => {
      let professionalId = existingId;
      if (professionalId) {
        const owned = await tx`SELECT id FROM professionals WHERE id = ${professionalId} AND account_id = ${user.accountId}`;
        if (!owned.length) throw new FormError("fora");
      } else {
        professionalId = randomUUID();
      }
      if (loginId) {
        const allowed = await tx`
          SELECT id FROM users
          WHERE id = ${loginId} AND account_id = ${user.accountId} AND role = 'profissional'
        `;
        const taken = await tx`
          SELECT id FROM professionals WHERE user_id = ${loginId} AND id <> ${professionalId}
        `;
        if (!allowed.length || taken.length) throw new FormError("login");
      }

      const fields = {
        name,
        nickname: textOrNull(formData.get("nickname")),
        phone: phone || null,
        email,
        notes: textOrNull(formData.get("notes")),
        active: checked(formData, "active"),
        bookable: checked(formData, "bookable"),
        color,
        birth: birth || null,
        login: loginId || null,
      };

      if (existingId) {
        await tx`
          UPDATE professionals SET
            name = ${fields.name}, nickname = ${fields.nickname}, phone = ${fields.phone},
            email = ${fields.email}, notes = ${fields.notes}, active = ${fields.active},
            bookable = ${fields.bookable}, column_color = ${fields.color},
            birth_date = ${fields.birth}, user_id = ${fields.login}
          WHERE id = ${professionalId}
        `;
      } else {
        await tx`
          INSERT INTO professionals (
            id, account_id, user_id, name, nickname, phone, email, notes, active, bookable, column_color, birth_date
          ) VALUES (
            ${professionalId}, ${user.accountId}, ${fields.login}, ${fields.name}, ${fields.nickname},
            ${fields.phone}, ${fields.email}, ${fields.notes}, ${fields.active}, ${fields.bookable},
            ${fields.color}, ${fields.birth}
          )
        `;
      }

      const catalog = await tx<{ id: string; priceCents: number; durationMin: number; commissionPercent: number }[]>`
        SELECT id, price_cents AS "priceCents", duration_min AS "durationMin", commission_percent AS "commissionPercent"
        FROM services WHERE account_id = ${user.accountId}
      `;
      const allowed = new Map(catalog.map((row) => [row.id, row]));
      await tx`DELETE FROM professional_services WHERE professional_id = ${professionalId}`;
      for (const serviceId of formData.getAll("does").map(String)) {
        const service = allowed.get(serviceId);
        if (!service) throw new FormError("dados");
        const priceRaw = String(formData.get(`price_${serviceId}`) ?? "").trim();
        const durationRaw = String(formData.get(`duration_${serviceId}`) ?? "").trim();
        const commissionRaw = String(formData.get(`commission_${serviceId}`) ?? "").trim();
        let price = priceRaw ? parseReais(priceRaw) : null;
        let duration = durationRaw ? parseIntField(durationRaw) : null;
        let commission = commissionRaw ? parsePercent(commissionRaw) : null;
        if ((priceRaw && price == null) || (durationRaw && (duration == null || duration < 5 || duration > 480)) || (commissionRaw && commission == null)) {
          throw new FormError("dados");
        }
        if (price === service.priceCents) price = null;
        if (duration === service.durationMin) duration = null;
        if (commission === service.commissionPercent) commission = null;
        await tx`
          INSERT INTO professional_services (professional_id, service_id, price_cents, duration_min, commission_percent)
          VALUES (${professionalId}, ${serviceId}, ${price}, ${duration}, ${commission})
        `;
      }

      const fixed = readHours(formData, "f");
      await tx`DELETE FROM professional_hours WHERE professional_id = ${professionalId} AND valid_from IS NULL`;
      for (const slot of fixed) {
        await tx`
          INSERT INTO professional_hours (id, professional_id, weekday, period, start_time, end_time)
          VALUES (${randomUUID()}, ${professionalId}, ${slot.weekday}, ${slot.period}, ${slot.start}, ${slot.end})
        `;
      }

      const from = String(formData.get("override_from") ?? "").trim();
      const until = String(formData.get("override_until") ?? "").trim();
      const override = readHours(formData, "o");
      if (!from && !until) {
        if (override.length) throw new FormError("periodo");
        await tx`DELETE FROM professional_hours WHERE professional_id = ${professionalId} AND valid_from IS NOT NULL`;
      } else {
        if (!DATE.test(from) || !DATE.test(until) || until < from || !override.length) throw new FormError("periodo");
        await tx`DELETE FROM professional_hours WHERE professional_id = ${professionalId} AND valid_from IS NOT NULL`;
        for (const slot of override) {
          await tx`
            INSERT INTO professional_hours (id, professional_id, weekday, period, start_time, end_time, valid_from, valid_until)
            VALUES (${randomUUID()}, ${professionalId}, ${slot.weekday}, ${slot.period}, ${slot.start}, ${slot.end}, ${from}, ${until})
          `;
        }
      }
      return professionalId;
    });
    return `/profissionais?ok=salvo`;
  });
}
