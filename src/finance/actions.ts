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
    const settled = await db()`SELECT id FROM card_settlements WHERE bank_account_id = ${id} LIMIT 1`;
    if (settled.length) throw new FormError("uso");
    await db()`DELETE FROM bank_accounts WHERE id = ${id} AND account_id = ${user.accountId}`;
    return "/financeiro/bancos";
  });
}

export async function settlePayable(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro", async () => {
    const id = String(formData.get("id") ?? "");
    const bankId = String(formData.get("bank") ?? "");
    const cardId = String(formData.get("card") ?? "");
    const day = String(formData.get("day") ?? "");
    const method = String(formData.get("method") ?? "");
    const brand = textOrNull(formData.get("brand"));
    if (!UUID.test(id)) throw new FormError("dados");
    const rows = await db()<{ paidOn: string | null; method: string | null; bankId: string | null; cardId: string | null }[]>`
      SELECT paid_on::text AS "paidOn", method, bank_account_id AS "bankId", credit_card_id AS "cardId"
      FROM payables
      WHERE id = ${id} AND account_id = ${user.accountId}
    `;
    const row = rows[0];
    if (!row) throw new FormError("fora");
    if (row.bankId || row.cardId) throw new FormError("pago");
    const credit = row.paidOn ? row.method === "credito" : method === "credito";
    if (!row.paidOn) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !PAYABLE_METHODS.includes(method)) throw new FormError("dados");
      if ((method === "debito" || method === "credito") && (!brand || brand.length < 2)) throw new FormError("bandeira");
    }
    if (credit) {
      if (!UUID.test(cardId)) throw new FormError("dados");
      const card = await db()`
        SELECT id FROM credit_cards WHERE id = ${cardId} AND account_id = ${user.accountId} AND active
      `;
      if (!card.length) throw new FormError("fora");
      const updated = row.paidOn
        ? await db()`
            UPDATE payables SET credit_card_id = ${cardId}
            WHERE id = ${id} AND account_id = ${user.accountId} AND credit_card_id IS NULL AND bank_account_id IS NULL
            RETURNING id
          `
        : await db()`
            UPDATE payables
            SET paid_on = ${day}::date, method = 'credito', card_brand = ${brand}, credit_card_id = ${cardId}
            WHERE id = ${id} AND account_id = ${user.accountId} AND paid_on IS NULL AND credit_card_id IS NULL AND bank_account_id IS NULL
            RETURNING id
          `;
      if (!updated.length) throw new FormError("pago");
      return "/financeiro/cartoes?ok=cartao";
    }
    if (!UUID.test(bankId)) throw new FormError("dados");
    const bank = await db()`
      SELECT id FROM bank_accounts WHERE id = ${bankId} AND account_id = ${user.accountId} AND active
    `;
    if (!bank.length) throw new FormError("fora");
    const cardBrand = method === "debito" ? brand : null;
    const updated = row.paidOn
      ? await db()`
          UPDATE payables SET bank_account_id = ${bankId}
          WHERE id = ${id} AND account_id = ${user.accountId} AND bank_account_id IS NULL AND credit_card_id IS NULL
          RETURNING id
        `
      : await db()`
          UPDATE payables
          SET paid_on = ${day}::date, method = ${method}, card_brand = ${cardBrand}, bank_account_id = ${bankId}
          WHERE id = ${id} AND account_id = ${user.accountId} AND paid_on IS NULL AND bank_account_id IS NULL AND credit_card_id IS NULL
          RETURNING id
        `;
    if (!updated.length) throw new FormError("pago");
    return `/financeiro/bancos?ok=baixa&banco=${bankId}`;
  });
}

export async function saveCard(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro/cartoes", async () => {
    const name = String(formData.get("name") ?? "").trim();
    const limitRaw = String(formData.get("limit") ?? "").trim();
    const limit = limitRaw ? parseReais(limitRaw) : 0;
    const closing = parseReaisDay(formData.get("closing"));
    const due = parseReaisDay(formData.get("due"));
    if (name.length < 2 || limit == null || closing == null || due == null) throw new FormError("dados");
    const same = await db()`
      SELECT id FROM credit_cards WHERE account_id = ${user.accountId} AND lower(name) = ${name.toLowerCase()}
    `;
    if (same.length) throw new FormError("cartao");
    await db()`
      INSERT INTO credit_cards (id, account_id, name, institution, limit_cents, closing_day, due_day)
      VALUES (
        ${randomUUID()}, ${user.accountId}, ${name}, ${textOrNull(formData.get("institution"))},
        ${limit}, ${closing}, ${due}
      )
    `;
    return "/financeiro/cartoes?ok=salvo";
  });
}

function parseReaisDay(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  const day = Number(raw);
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;
  return day;
}

export async function deleteCard(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro/cartoes", async () => {
    const id = String(formData.get("id") ?? "");
    if (!UUID.test(id)) throw new FormError("dados");
    const found = await db()`SELECT id FROM credit_cards WHERE id = ${id} AND account_id = ${user.accountId}`;
    if (!found.length) throw new FormError("fora");
    const used = await db()`SELECT id FROM payables WHERE credit_card_id = ${id} LIMIT 1`;
    if (used.length) throw new FormError("ligado");
    await db()`DELETE FROM credit_cards WHERE id = ${id} AND account_id = ${user.accountId}`;
    return "/financeiro/cartoes";
  });
}

export async function payCardInvoice(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro/cartoes", async () => {
    const cardId = String(formData.get("card") ?? "");
    const bankId = String(formData.get("bank") ?? "");
    const day = String(formData.get("day") ?? "");
    if (!UUID.test(cardId) || !UUID.test(bankId) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new FormError("dados");
    let settlementBank = bankId;
    await db().begin(async (tx) => {
      const card = await tx`
        SELECT id FROM credit_cards WHERE id = ${cardId} AND account_id = ${user.accountId} AND active
      `;
      if (!card.length) throw new FormError("fora");
      const bank = await tx`SELECT id FROM bank_accounts WHERE id = ${bankId} AND account_id = ${user.accountId} AND active`;
      if (!bank.length) throw new FormError("fora");
      const open = await tx<{ id: string; amountCents: number }[]>`
        SELECT id, amount_cents AS "amountCents" FROM payables
        WHERE account_id = ${user.accountId} AND credit_card_id = ${cardId} AND card_settlement_id IS NULL
        FOR UPDATE
      `;
      const total = open.reduce((sum, line) => sum + line.amountCents, 0);
      if (total < 1 || open.length === 0) throw new FormError("fatura");
      const settlementId = randomUUID();
      await tx`
        INSERT INTO card_settlements (id, account_id, credit_card_id, bank_account_id, paid_on, amount_cents, created_by)
        VALUES (${settlementId}, ${user.accountId}, ${cardId}, ${bankId}, ${day}::date, ${total}, ${user.id})
      `;
      await tx`
        UPDATE payables SET card_settlement_id = ${settlementId}
        WHERE account_id = ${user.accountId} AND id IN ${tx(open.map((line) => line.id))}
      `;
      settlementBank = bankId;
    });
    return `/financeiro/bancos?ok=fatura&banco=${settlementBank}`;
  });
}
