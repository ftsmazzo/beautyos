"use server";

import { redirect } from "next/navigation";
import { parsePercent } from "@/catalog/format";
import { currentUser } from "@/auth/session";
import { db } from "@/db/client";

export async function saveHouseRules(formData: FormData) {
  const user = await currentUser();
  if (!user || user.role !== "administrador") redirect("/inicio");
  const referral = parsePercent(formData.get("referral"));
  const consumption = parsePercent(formData.get("consumption"));
  if (referral == null || consumption == null) redirect("/inicio?erro=dados");
  await db()`
    UPDATE accounts
    SET referral_commission_percent = ${referral},
        staff_consumption_percent = ${consumption}
    WHERE id = ${user.accountId}
  `;
  redirect("/inicio?ok=regras");
}
