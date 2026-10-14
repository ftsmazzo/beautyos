import { randomUUID } from "crypto";
import { todaySaoPaulo } from "@/catalog/format";
import { shiftMonth } from "@/desk/clock";
import { db } from "@/db/client";

export async function materializeRecurrences(accountId: string) {
  const today = todaySaoPaulo();
  const series = await db()<{
    id: string;
    description: string;
    partyName: string;
    amountCents: number;
    anchorOn: string;
    chartId: string | null;
    createdBy: string | null;
  }[]>`
    SELECT id, description, party_name AS "partyName", amount_cents AS "amountCents",
           to_char(anchor_on, 'YYYY-MM-DD') AS "anchorOn",
           chart_account_id AS "chartId", created_by AS "createdBy"
    FROM payable_recurrences
    WHERE account_id = ${accountId} AND active
  `;
  let created = 0;
  for (const item of series) {
    let cursor = item.anchorOn;
    for (let guard = 0; guard < 36 && cursor <= today; guard += 1) {
      const existing = await db()`
        SELECT id FROM payables
        WHERE recurrence_id = ${item.id} AND due_on = ${cursor}::date
        LIMIT 1
      `;
      if (!existing.length) {
        const label = `${item.description} · ${cursor.slice(5, 7)}/${cursor.slice(0, 4)}`;
        try {
          await db()`
            INSERT INTO payables (
              id, account_id, purchase_id, recurrence_id, description, party_name,
              amount_cents, due_on, installment_index, installment_total,
              chart_account_id, created_by
            )
            VALUES (
              ${randomUUID()}, ${accountId}, NULL, ${item.id}, ${label}, ${item.partyName},
              ${item.amountCents}, ${cursor}::date, 1, 1, ${item.chartId}, ${item.createdBy}
            )
          `;
          created += 1;
        } catch (error) {
          const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
          if (code !== "23505") throw error;
        }
      }
      cursor = shiftMonth(cursor, 1);
    }
  }
  return created;
}

export async function materializeDueRecurrences() {
  const accounts = await db()<{ id: string }[]>`
    SELECT DISTINCT account_id AS id FROM payable_recurrences WHERE active
  `;
  let created = 0;
  for (const account of accounts) created += await materializeRecurrences(account.id);
  if (created > 0) console.log(`recorrencia criou ${created}`);
  return created;
}

export function startRecurrenceClock() {
  const state = globalThis as { beautyosClock?: boolean };
  if (state.beautyosClock) return;
  state.beautyosClock = true;
  console.log("recorrencia relogio");
  let ticks = 0;
  const run = () => {
    ticks += 1;
    const tick = ticks;
    materializeDueRecurrences()
      .then((created) => {
        if (tick <= 3 || created > 0) console.log(`recorrencia passou ${created}`);
      })
      .catch((error) => {
        console.error("recorrencia", error);
      });
  };
  run();
  setInterval(run, 60 * 1000);
}
