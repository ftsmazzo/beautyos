"use server";

import { randomUUID } from "crypto";
import { requireAdmin } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { parseReais, textOrNull } from "@/catalog/format";
import { settle } from "@/catalog/settle";
import { db } from "@/db/client";

const KINDS = ["corrente", "poupanca", "outro"];

function parseSignedReais(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (trimmed.startsWith("-")) {
    const amount = parseReais(trimmed.slice(1));
    return amount == null ? null : -amount;
  }
  return parseReais(trimmed);
}

export async function saveBank(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro/bancos", async () => {
    const name = String(formData.get("name") ?? "").trim();
    const kind = String(formData.get("kind") ?? "");
    const openingRaw = String(formData.get("opening") ?? "");
    const opening = parseSignedReais(openingRaw);
    const openingOn = String(formData.get("opening_on") ?? "");
    if (name.length < 2 || !KINDS.includes(kind) || opening == null) throw new FormError("dados");
    if (openingOn && !/^\d{4}-\d{2}-\d{2}$/.test(openingOn)) throw new FormError("dados");
    const same = await db()`
      SELECT id FROM bank_accounts
      WHERE account_id = ${user.accountId} AND lower(name) = ${name.toLowerCase()}
    `;
    if (same.length) throw new FormError("banco");
    await db()`
      INSERT INTO bank_accounts (id, account_id, name, institution, kind, code, opening_cents, opening_on)
      VALUES (
        ${randomUUID()}, ${user.accountId}, ${name}, ${textOrNull(formData.get("institution"))},
        ${kind}, ${textOrNull(formData.get("code"))}, ${opening},
        ${openingOn || null}::date
      )
    `;
    return "/financeiro/bancos?ok=banco";
  });
}

export async function deleteBank(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro/bancos", async () => {
    const id = String(formData.get("id") ?? "");
    const found = await db()`
      SELECT id FROM bank_accounts WHERE id = ${id} AND account_id = ${user.accountId}
    `;
    if (!found.length) throw new FormError("fora");
    await db()`DELETE FROM bank_accounts WHERE id = ${id} AND account_id = ${user.accountId}`;
    return "/financeiro/bancos";
  });
}
