"use server";

import { redirect } from "next/navigation";
import { HOUSE_MODULES } from "@/catalog/modules";
import { parsePercent, parseRateBps, textOrNull } from "@/catalog/format";
import { randomUUID } from "crypto";
import { currentUser } from "@/auth/session";
import { db } from "@/db/client";

export async function saveHouseRules(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "administrador") redirect("/inicio");
  const referral = parsePercent(formData.get("referral"));
  const consumption = parsePercent(formData.get("consumption"));
  const serviceDiscount = parsePercent(formData.get("service_discount"));
  const extrasLadder = formData.get("extras_ladder") === "1";
  if (referral == null || consumption == null || serviceDiscount == null) redirect("/inicio?erro=dados");
  await db()`
    UPDATE accounts
    SET referral_commission_percent = ${referral},
        staff_consumption_percent = ${consumption},
        staff_service_discount_percent = ${serviceDiscount},
        extras_ladder = ${extrasLadder}
    WHERE id = ${user.accountId}
  `;
  redirect("/inicio?ok=regras");
}

export async function saveCardAcquirer(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "administrador") redirect("/inicio");
  const name = textOrNull(formData.get("name"));
  const debit = parseRateBps(formData.get("debit"));
  const credit = parseRateBps(formData.get("credit"));
  const id = textOrNull(formData.get("id"));
  if (!name || name.length < 2 || debit == null || credit == null) redirect("/inicio?erro=taxa");
  const sql = db();
  const clash = await sql<{ id: string; active: boolean }[]>`
    SELECT id, active FROM card_acquirers
    WHERE account_id = ${user.accountId} AND lower(name) = lower(${name})
  `;
  const other = clash.find((row) => row.id !== id);
  if (other?.active) redirect("/inicio?erro=taxa");
  const target = id ?? other?.id ?? null;
  if (target) {
    const updated = await sql<{ id: string }[]>`
      UPDATE card_acquirers
      SET name = ${name}, debit_bps = ${debit}, credit_bps = ${credit}, active = true
      WHERE id = ${target} AND account_id = ${user.accountId}
      RETURNING id
    `;
    if (!updated.length) redirect("/inicio?erro=taxa");
  } else {
    await sql`
      INSERT INTO card_acquirers (id, account_id, name, debit_bps, credit_bps)
      VALUES (${randomUUID()}, ${user.accountId}, ${name}, ${debit}, ${credit})
    `;
  }
  redirect("/inicio?ok=regras");
}

export async function stopCardAcquirer(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "administrador") redirect("/inicio");
  const id = textOrNull(formData.get("id"));
  if (!id) redirect("/inicio?erro=taxa");
  await db()`
    UPDATE card_acquirers SET active = false
    WHERE id = ${id} AND account_id = ${user.accountId}
  `;
  redirect("/inicio?ok=regras");
}

export async function saveHouseModules(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "administrador") redirect("/inicio");
  const modules = Object.fromEntries(HOUSE_MODULES.map((item) => [item.id, formData.get(item.id) === "1"]));
  await db()`UPDATE accounts SET modules = ${db().json(modules)} WHERE id = ${user.accountId}`;
  redirect("/acesso?ok=modulos");
}
