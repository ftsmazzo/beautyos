"use server";

import { redirect } from "next/navigation";
import { HOUSE_MODULES } from "@/catalog/modules";
import { parsePercent } from "@/catalog/format";
import { currentUser } from "@/auth/session";
import { db } from "@/db/client";

export async function saveHouseRules(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "administrador") redirect("/inicio");
  const referral = parsePercent(formData.get("referral"));
  const consumption = parsePercent(formData.get("consumption"));
  const debit = parsePercent(formData.get("debit"));
  const credit = parsePercent(formData.get("credit"));
  const serviceDiscount = parsePercent(formData.get("service_discount"));
  if (referral == null || consumption == null || debit == null || credit == null || serviceDiscount == null) redirect("/inicio?erro=dados");
  await db()`
    UPDATE accounts
    SET referral_commission_percent = ${referral},
        staff_consumption_percent = ${consumption},
        card_debit_percent = ${debit},
        card_credit_percent = ${credit},
        staff_service_discount_percent = ${serviceDiscount}
    WHERE id = ${user.accountId}
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
