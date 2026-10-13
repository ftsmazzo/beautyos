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
