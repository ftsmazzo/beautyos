"use server";

import { randomUUID } from "crypto";
import { requireAdmin } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { checked, parseIntField, parseReais, textOrNull } from "@/catalog/format";
import { shiftMonth } from "@/desk/clock";
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
    const received = await db()`SELECT id FROM payments WHERE bank_account_id = ${id} LIMIT 1`;
    if (received.length) throw new FormError("uso");
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
    const chartRaw = String(formData.get("chart") ?? "");
    let chartId: string | null = null;
    if (chartRaw) {
      if (!UUID.test(chartRaw)) throw new FormError("dados");
      const chart = await db()`
        SELECT id FROM chart_accounts WHERE id = ${chartRaw} AND account_id = ${user.accountId} AND active
      `;
      if (!chart.length) throw new FormError("fora");
      chartId = chartRaw;
    }
    if (credit) {
      if (!UUID.test(cardId)) throw new FormError("dados");
      const card = await db()`
        SELECT id FROM credit_cards WHERE id = ${cardId} AND account_id = ${user.accountId} AND active
      `;
      if (!card.length) throw new FormError("fora");
      const updated = row.paidOn
        ? await db()`
            UPDATE payables SET credit_card_id = ${cardId}, chart_account_id = COALESCE(${chartId}::uuid, chart_account_id)
            WHERE id = ${id} AND account_id = ${user.accountId} AND credit_card_id IS NULL AND bank_account_id IS NULL
            RETURNING id
          `
        : await db()`
            UPDATE payables
            SET paid_on = ${day}::date, method = 'credito', card_brand = ${brand}, credit_card_id = ${cardId},
                chart_account_id = COALESCE(${chartId}::uuid, chart_account_id)
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
          UPDATE payables SET bank_account_id = ${bankId}, chart_account_id = COALESCE(${chartId}::uuid, chart_account_id)
          WHERE id = ${id} AND account_id = ${user.accountId} AND bank_account_id IS NULL AND credit_card_id IS NULL
          RETURNING id
        `
      : await db()`
          UPDATE payables
          SET paid_on = ${day}::date, method = ${method}, card_brand = ${cardBrand}, bank_account_id = ${bankId},
              chart_account_id = COALESCE(${chartId}::uuid, chart_account_id)
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

export async function saveChart(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro/plano", async () => {
    const code = String(formData.get("code") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    if (code.length < 1 || name.length < 2) throw new FormError("dados");
    const same = await db()`
      SELECT id FROM chart_accounts
      WHERE account_id = ${user.accountId} AND lower(code) = ${code.toLowerCase()}
    `;
    if (same.length) throw new FormError("apr");
    await db()`
      INSERT INTO chart_accounts (
        id, account_id, code, name, synthetic_name, dfc_group_1, dfc_group_2, dre_group_1, dre_group_2
      )
      VALUES (
        ${randomUUID()}, ${user.accountId}, ${code}, ${name},
        ${textOrNull(formData.get("synthetic"))},
        ${textOrNull(formData.get("dfc1"))}, ${textOrNull(formData.get("dfc2"))},
        ${textOrNull(formData.get("dre1"))}, ${textOrNull(formData.get("dre2"))}
      )
    `;
    return "/financeiro/plano?ok=salvo";
  });
}

export async function deleteChart(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro/plano", async () => {
    const id = String(formData.get("id") ?? "");
    if (!UUID.test(id)) throw new FormError("dados");
    const found = await db()`SELECT id FROM chart_accounts WHERE id = ${id} AND account_id = ${user.accountId}`;
    if (!found.length) throw new FormError("fora");
    const used = await db()`SELECT id FROM payables WHERE chart_account_id = ${id} LIMIT 1`;
    if (used.length) throw new FormError("presa");
    await db()`DELETE FROM chart_accounts WHERE id = ${id} AND account_id = ${user.accountId}`;
    return "/financeiro/plano";
  });
}

export async function saveTitle(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro", async () => {
    const description = String(formData.get("description") ?? "").trim();
    const party = String(formData.get("party") ?? "").trim();
    const amount = parseReais(String(formData.get("amount") ?? ""));
    const due = String(formData.get("due") ?? "");
    const mode = String(formData.get("mode") ?? "uma");
    const timesRaw = parseIntField(formData.get("times"));
    const times = mode === "uma" ? 1 : timesRaw ?? 1;
    const repeat = mode === "repete";
    const paid = checked(formData, "paid");
    const paidOn = String(formData.get("day") ?? "");
    const method = String(formData.get("method") ?? "");
    const brand = textOrNull(formData.get("brand"));
    if (!["uma", "parcela", "repete"].includes(mode)) throw new FormError("dados");
    if (description.length < 2 || party.length < 2 || amount == null || amount < 1) throw new FormError("dados");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || times < 1 || times > 36) throw new FormError("dados");
    if (paid && !/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new FormError("dados");
    if (paid && !PAYABLE_METHODS.includes(method)) throw new FormError("dados");
    if (paid && (method === "debito" || method === "credito") && (!brand || brand.length < 2)) throw new FormError("bandeira");
    const credit = paid && method === "credito";
    const bankRaw = credit ? "" : String(formData.get("bank") ?? "");
    const cardRaw = credit ? String(formData.get("card") ?? "") : "";
    const chartRaw = String(formData.get("chart") ?? "");
    await db().begin(async (tx) => {
      let bankId: string | null = null;
      let cardId: string | null = null;
      let chartId: string | null = null;
      if (bankRaw) {
        if (!UUID.test(bankRaw)) throw new FormError("dados");
        const bank = await tx`SELECT id FROM bank_accounts WHERE id = ${bankRaw} AND account_id = ${user.accountId} AND active`;
        if (!bank.length) throw new FormError("fora");
        bankId = bankRaw;
      }
      if (cardRaw) {
        if (!UUID.test(cardRaw)) throw new FormError("dados");
        const card = await tx`SELECT id FROM credit_cards WHERE id = ${cardRaw} AND account_id = ${user.accountId} AND active`;
        if (!card.length) throw new FormError("fora");
        cardId = cardRaw;
      }
      if (chartRaw) {
        if (!UUID.test(chartRaw)) throw new FormError("dados");
        const chart = await tx`SELECT id FROM chart_accounts WHERE id = ${chartRaw} AND account_id = ${user.accountId} AND active`;
        if (!chart.length) throw new FormError("fora");
        chartId = chartRaw;
      }
      const recurrenceId = repeat ? randomUUID() : null;
      if (recurrenceId) {
        await tx`
          INSERT INTO payable_recurrences (
            id, account_id, description, party_name, amount_cents, anchor_on, chart_account_id, created_by
          )
          VALUES (
            ${recurrenceId}, ${user.accountId}, ${description}, ${party}, ${amount},
            ${due}::date, ${chartId}, ${user.id}
          )
        `;
      }
      const base = Math.floor(amount / times);
      const rest = amount - base * times;
      for (let index = 1; index <= times; index += 1) {
        const dueOn = shiftMonth(due, index - 1);
        const part = repeat ? amount : base + (index === times ? rest : 0);
        const label = repeat
          ? `${description} · ${dueOn.slice(5, 7)}/${dueOn.slice(0, 4)}`
          : times === 1
            ? description
            : `${description} · ${index}/${times}`;
        const thisPaid = paid && (!repeat || index === 1);
        await tx`
          INSERT INTO payables (
            id, account_id, purchase_id, recurrence_id, description, party_name,
            amount_cents, due_on, installment_index, installment_total,
            method, card_brand, paid_on, bank_account_id, credit_card_id, chart_account_id, created_by
          )
          VALUES (
            ${randomUUID()}, ${user.accountId}, NULL, ${recurrenceId}, ${label}, ${party},
            ${part}, ${dueOn}::date, ${repeat ? 1 : index}, ${repeat ? 1 : times},
            ${thisPaid ? method : null}, ${thisPaid && (method === "debito" || method === "credito") ? brand : null},
            ${thisPaid ? paidOn : null}::date, ${thisPaid ? bankId : null}, ${thisPaid ? cardId : null}, ${chartId}, ${user.id}
          )
        `;
      }
    });
    if (repeat && times > 1) return "/financeiro?ok=titulo&filtro=todos";
    return paid ? "/financeiro?ok=titulo&filtro=pago" : "/financeiro?ok=titulo";
  });
}

export async function stopRecurrence(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro", async () => {
    const id = String(formData.get("id") ?? "");
    if (!UUID.test(id)) throw new FormError("dados");
    const updated = await db()`
      UPDATE payable_recurrences SET active = false
      WHERE id = ${id} AND account_id = ${user.accountId} AND active
      RETURNING id
    `;
    if (!updated.length) throw new FormError("fora");
    return "/financeiro?ok=encerra";
  });
}

export async function deleteTitle(formData: FormData) {
  const user = await requireAdmin();
  return settle("/financeiro", async () => {
    const id = String(formData.get("id") ?? "");
    if (!UUID.test(id)) throw new FormError("dados");
    const rows = await db()<{ purchaseId: string | null; settlementId: string | null }[]>`
      SELECT purchase_id AS "purchaseId", card_settlement_id AS "settlementId"
      FROM payables
      WHERE id = ${id} AND account_id = ${user.accountId}
    `;
    const row = rows[0];
    if (!row || row.purchaseId) throw new FormError("fora");
    if (row.settlementId) throw new FormError("quitada");
    await db()`DELETE FROM payables WHERE id = ${id} AND account_id = ${user.accountId} AND purchase_id IS NULL`;
    return "/financeiro";
  });
}
