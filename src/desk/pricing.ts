import type { TransactionSql } from "postgres";
import { minutes, weekdayOf } from "@/desk/clock";

export async function chargedServicePrice(
  tx: TransactionSql,
  serviceId: string,
  day: string,
  start: string,
  sheetCents: number,
) {
  const discounts = await tx<{ mode: string; amount: number; startTime: string | null; endTime: string | null }[]>`
    SELECT mode, amount, start_time AS "startTime", end_time AS "endTime"
    FROM service_discounts
    WHERE service_id = ${serviceId} AND weekday = ${weekdayOf(day)}
  `;
  const hit = discounts.find((discount) => {
    if (!discount.startTime || !discount.endTime) return true;
    const at = minutes(start);
    return minutes(discount.startTime) <= at && at < minutes(discount.endTime);
  });
  if (hit?.mode === "percentual") return Math.max(0, Math.round((sheetCents * (100 - hit.amount)) / 100));
  if (hit?.mode === "valor") return Math.max(0, sheetCents - hit.amount);
  return sheetCents;
}
