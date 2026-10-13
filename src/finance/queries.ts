import { db } from "@/db/client";

export type BankRow = {
  id: string;
  name: string;
  institution: string | null;
  kind: string;
  code: string | null;
  openingCents: number;
  openingOn: string | null;
};

export async function listBanks(accountId: string) {
  return db()<BankRow[]>`
    SELECT id, name, institution, kind, code,
           opening_cents AS "openingCents",
           to_char(opening_on, 'DD/MM/YYYY') AS "openingOn"
    FROM bank_accounts
    WHERE account_id = ${accountId} AND active
    ORDER BY name
  `;
}

export type BankLine = {
  id: string;
  description: string;
  partyName: string;
  amountCents: number;
  paid: string;
};

export async function listBankLines(accountId: string, bankId: string) {
  return db()<BankLine[]>`
    SELECT id, description, party_name AS "partyName", amount_cents AS "amountCents", paid
    FROM (
      SELECT p.id, p.description, p.party_name, p.amount_cents,
             to_char(p.paid_on, 'DD/MM/YYYY') AS paid, p.paid_on AS sort_on, p.installment_index AS sort_n
      FROM payables p
      WHERE p.account_id = ${accountId} AND p.bank_account_id = ${bankId} AND p.paid_on IS NOT NULL
      UNION ALL
      SELECT s.id, 'Fatura ' || c.name, c.name, s.amount_cents,
             to_char(s.paid_on, 'DD/MM/YYYY'), s.paid_on, 0
      FROM card_settlements s
      JOIN credit_cards c ON c.id = s.credit_card_id
      WHERE s.account_id = ${accountId} AND s.bank_account_id = ${bankId}
    ) lines
    ORDER BY sort_on, sort_n
  `;
}

export type GroupTotal = { group: string; totalCents: number };

function outflowGroups(accountId: string, start: string, next: string, kind: "dfc" | "dre") {
  const lines = db()`
    SELECT amount_cents, chart_account_id
    FROM payables
    WHERE account_id = ${accountId}
      AND bank_account_id IS NOT NULL
      AND credit_card_id IS NULL
      AND paid_on >= ${start}::date
      AND paid_on < ${next}::date
    UNION ALL
    SELECT p.amount_cents, p.chart_account_id
    FROM payables p
    JOIN card_settlements s ON s.id = p.card_settlement_id
    WHERE p.account_id = ${accountId}
      AND s.paid_on >= ${start}::date
      AND s.paid_on < ${next}::date
  `;
  if (kind === "dfc") {
    return db()<GroupTotal[]>`
      SELECT
        CASE
          WHEN c.id IS NULL THEN 'Sem conta'
          WHEN c.dfc_group_1 IS NULL AND c.dfc_group_2 IS NULL THEN 'Sem grupo'
          ELSE btrim(concat(c.dfc_group_1, CASE WHEN c.dfc_group_1 IS NOT NULL AND c.dfc_group_2 IS NOT NULL THEN ' / ' ELSE '' END, COALESCE(c.dfc_group_2, '')))
        END AS "group",
        SUM(lines.amount_cents)::int AS "totalCents"
      FROM (${lines}) lines
      LEFT JOIN chart_accounts c ON c.id = lines.chart_account_id
      GROUP BY 1
      ORDER BY 1
    `;
  }
  return db()<GroupTotal[]>`
    SELECT
      CASE
        WHEN c.id IS NULL THEN 'Sem conta'
        WHEN c.dre_group_1 IS NULL AND c.dre_group_2 IS NULL THEN 'Sem grupo'
        ELSE btrim(concat(c.dre_group_1, CASE WHEN c.dre_group_1 IS NOT NULL AND c.dre_group_2 IS NOT NULL THEN ' / ' ELSE '' END, COALESCE(c.dre_group_2, '')))
      END AS "group",
      SUM(lines.amount_cents)::int AS "totalCents"
    FROM (${lines}) lines
    LEFT JOIN chart_accounts c ON c.id = lines.chart_account_id
    GROUP BY 1
    ORDER BY 1
  `;
}

export function listFlowGroups(accountId: string, start: string, next: string) {
  return outflowGroups(accountId, start, next, "dfc");
}

export function listResultGroups(accountId: string, start: string, next: string) {
  return outflowGroups(accountId, start, next, "dre");
}

export type ChartRow = {
  id: string;
  code: string;
  name: string;
  syntheticName: string | null;
  dfcGroup1: string | null;
  dfcGroup2: string | null;
  dreGroup1: string | null;
  dreGroup2: string | null;
};

export async function listChart(accountId: string) {
  return db()<ChartRow[]>`
    SELECT id, code, name, synthetic_name AS "syntheticName",
           dfc_group_1 AS "dfcGroup1", dfc_group_2 AS "dfcGroup2",
           dre_group_1 AS "dreGroup1", dre_group_2 AS "dreGroup2"
    FROM chart_accounts
    WHERE account_id = ${accountId} AND active
    ORDER BY code
  `;
}

export type CardRow = {
  id: string;
  name: string;
  institution: string | null;
  limitCents: number;
  closingDay: number;
  dueDay: number;
  openCents: number;
};

export async function listCards(accountId: string) {
  return db()<CardRow[]>`
    SELECT c.id, c.name, c.institution, c.limit_cents AS "limitCents",
           c.closing_day AS "closingDay", c.due_day AS "dueDay",
           COALESCE((
             SELECT SUM(p.amount_cents) FROM payables p
             WHERE p.credit_card_id = c.id AND p.card_settlement_id IS NULL
           ), 0)::int AS "openCents"
    FROM credit_cards c
    WHERE c.account_id = ${accountId} AND c.active
    ORDER BY c.name
  `;
}

export async function listCardCharges(accountId: string, cardId: string) {
  return db()<BankLine[]>`
    SELECT id, description, party_name AS "partyName", amount_cents AS "amountCents",
           to_char(paid_on, 'DD/MM/YYYY') AS paid
    FROM payables
    WHERE account_id = ${accountId} AND credit_card_id = ${cardId} AND card_settlement_id IS NULL
    ORDER BY paid_on, installment_index
  `;
}
