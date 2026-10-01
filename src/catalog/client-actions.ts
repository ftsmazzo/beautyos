"use server";

import { randomUUID } from "crypto";
import { requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { CHANNELS } from "@/catalog/labels";
import { checked, digits, parsePercent, textOrNull } from "@/catalog/format";
import { settle } from "@/catalog/settle";
import { db } from "@/db/client";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CHANNEL_VALUES = new Set<string>(CHANNELS.map((item) => item.value));

export async function saveClient(formData: FormData) {
  const user = await requireOperator();
  const existingId = String(formData.get("id") ?? "");
  const failBase = existingId ? `/clientes/${existingId}` : "/clientes/novo";
  return settle(failBase, async () => {
    const name = String(formData.get("name") ?? "").trim();
    const phone = digits(String(formData.get("phone") ?? ""));
    const email = textOrNull(formData.get("email"));
    const birth = String(formData.get("birth") ?? "").trim();
    const channel = String(formData.get("channel") ?? "nao_informado");
    if (name.length < 2 || phone.length < 8 || (email && !email.includes("@"))) throw new FormError("dados");
    if (birth && !DATE.test(birth)) throw new FormError("dados");
    if (!CHANNEL_VALUES.has(channel)) throw new FormError("dados");

    let professionalId = String(formData.get("referrer_professional") ?? "");
    let clientId = String(formData.get("referrer_client") ?? "");
    const commissionRaw = String(formData.get("referral_commission") ?? "").trim();
    let commission = commissionRaw ? parsePercent(formData.get("referral_commission")) : null;
    if (commissionRaw && commission == null) throw new FormError("dados");
    if (channel !== "indicacao") {
      professionalId = "";
      clientId = "";
      commission = null;
    } else if ((!professionalId && !clientId) || (professionalId && clientId)) {
      throw new FormError("quem");
    }

    const id = await db().begin(async (tx) => {
      let rowId = existingId;
      if (rowId) {
        const owned = await tx`SELECT id FROM clients WHERE id = ${rowId} AND account_id = ${user.accountId}`;
        if (!owned.length) throw new FormError("fora");
        if (clientId === rowId) throw new FormError("quem");
      } else {
        rowId = randomUUID();
      }
      if (professionalId) {
        const found = await tx`SELECT id FROM professionals WHERE id = ${professionalId} AND account_id = ${user.accountId}`;
        if (!found.length) throw new FormError("quem");
      }
      if (clientId) {
        const found = await tx`SELECT id FROM clients WHERE id = ${clientId} AND account_id = ${user.accountId}`;
        if (!found.length) throw new FormError("quem");
      }
      const values = {
        name,
        phone,
        email,
        birth: birth || null,
        notes: textOrNull(formData.get("notes")),
        channel,
        fromOutside: checked(formData, "from_outside"),
        incomplete: checked(formData, "incomplete"),
        landline: textOrNull(formData.get("landline")),
        cpf: textOrNull(formData.get("cpf")),
        rg: textOrNull(formData.get("rg")),
        sex: textOrNull(formData.get("sex")),
        address: textOrNull(formData.get("address")),
        professionalId: professionalId || null,
        clientId: clientId || null,
        commission,
        active: checked(formData, "active"),
      };
      if (existingId) {
        await tx`
          UPDATE clients SET
            name = ${values.name}, phone = ${values.phone}, email = ${values.email}, birth_date = ${values.birth},
            notes = ${values.notes}, channel = ${values.channel}, from_outside = ${values.fromOutside},
            incomplete = ${values.incomplete}, landline = ${values.landline}, cpf = ${values.cpf}, rg = ${values.rg},
            sex = ${values.sex}, address = ${values.address},
            referrer_professional_id = ${values.professionalId}, referrer_client_id = ${values.clientId},
            referral_commission_percent = ${values.commission}, active = ${values.active}
          WHERE id = ${rowId}
        `;
      } else {
        await tx`
          INSERT INTO clients (
            id, account_id, name, phone, email, birth_date, notes, channel, from_outside, incomplete,
            landline, cpf, rg, sex, address, referrer_professional_id, referrer_client_id,
            referral_commission_percent, active
          ) VALUES (
            ${rowId}, ${user.accountId}, ${values.name}, ${values.phone}, ${values.email}, ${values.birth},
            ${values.notes}, ${values.channel}, ${values.fromOutside}, ${values.incomplete}, ${values.landline},
            ${values.cpf}, ${values.rg}, ${values.sex}, ${values.address}, ${values.professionalId},
            ${values.clientId}, ${values.commission}, ${values.active}
          )
        `;
      }
      return rowId;
    });
    return `/clientes/${id}`;
  });
}
