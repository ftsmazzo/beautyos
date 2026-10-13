"use server";

import { randomUUID } from "crypto";
import { requireAdmin } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { parseReais, textOrNull } from "@/catalog/format";
import { settle } from "@/catalog/settle";
import { db } from "@/db/client";

const PAYABLE_METHODS = ["dinheiro", "pix", "debito", "credito", "outros"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    const used = await db()`SELECT id FROM payables WHERE bank_account_id = ${id} LIMIT 1`;
    if (used.length) throw new FormError("uso");
    await db()`DELETE FROM bank_accounts WHERE id = ${id} AND account_id = ${user.accountId}`;
    return "/financeiro/bancos";
  });
}

export async function settlePayable(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro", async () => {
    const id = String(formData.get("id") ?? "");
    const bankId = String(formData.get("bank") ?? "");
    if (!UUID.test(id) || !UUID.test(bankId)) throw new FormError("dados");
    const day = String(formData.get("day") ?? "");
    const method = String(formData.get("method") ?? "");
    const brand = textOrNull(formData.get("brand"));
    const rows = await db()<{ paidOn: string | null; bankId: string | null }[]>`
      SELECT paid_on::text AS "paidOn", bank_account_id AS "bankId"
      FROM payables
      WHERE id = ${id} AND account_id = ${user.accountId}
    `;
    const row = rows[0];
    if (!row) throw new FormError("fora");
    if (row.bankId) throw new FormError("pago");
    const bank = await db()`
      SELECT id FROM bank_accounts
      WHERE id = ${bankId} AND account_id = ${user.accountId} AND active
    `;
    if (!bank.length) throw new FormError("fora");
    if (row.paidOn) {
      const updated = await db()`
        UPDATE payables SET bank_account_id = ${bankId}
        WHERE id = ${id} AND account_id = ${user.accountId} AND bank_account_id IS NULL
        RETURNING id
      `;
      if (!updated.length) throw new FormError("pago");
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !PAYABLE_METHODS.includes(method)) throw new FormError("dados");
      if ((method === "debito" || method === "credito") && (!brand || brand.length < 2)) throw new FormError("bandeira");
      const card = method === "debito" || method === "credito" ? brand : null;
      const updated = await db()`
        UPDATE payables
        SET paid_on = ${day}::date, method = ${method}, card_brand = ${card}, bank_account_id = ${bankId}
        WHERE id = ${id} AND account_id = ${user.accountId} AND paid_on IS NULL AND bank_account_id IS NULL
        RETURNING id
      `;
      if (!updated.length) throw new FormError("pago");
    }
    return `/financeiro/bancos?ok=baixa&banco=${bankId}`;
  });
}
