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
    SELECT id, description, party_name AS "partyName", amount_cents AS "amountCents",
           to_char(paid_on, 'DD/MM/YYYY') AS paid
    FROM payables
    WHERE account_id = ${accountId} AND bank_account_id = ${bankId} AND paid_on IS NOT NULL
    ORDER BY paid_on, installment_index
  `;
}
