import type { TransactionSql } from "postgres";

export async function stampReferral(
  tx: TransactionSql,
  accountId: string,
  orderId: string,
  lineId: string,
  baseCents: number,
) {
  const rows = await tx<{
    channel: string | null;
    professionalId: string | null;
    clientId: string | null;
    percent: number | null;
    house: number;
  }[]>`
    SELECT c.channel,
           c.referrer_professional_id AS "professionalId",
           c.referrer_client_id AS "clientId",
           c.referral_commission_percent AS percent,
           a.referral_commission_percent AS house
    FROM orders o
    JOIN accounts a ON a.id = o.account_id
    LEFT JOIN clients c ON c.id = o.client_id
    WHERE o.id = ${orderId} AND o.account_id = ${accountId}
  `;
  const row = rows[0];
  const percent = row?.percent ?? row?.house ?? 0;
  const brought = Boolean(row?.professionalId) !== Boolean(row?.clientId);
  const eligible = row?.channel === "indicacao" && brought && percent > 0 && baseCents > 0;
  const cents = eligible ? Math.round((baseCents * percent) / 100) : 0;
  await tx`
    UPDATE order_lines
    SET referral_cents = ${cents},
        referrer_professional_id = ${cents > 0 ? row?.professionalId ?? null : null},
        referrer_client_id = ${cents > 0 ? row?.clientId ?? null : null}
    WHERE id = ${lineId} AND order_id = ${orderId}
  `;
}

export async function restampOrder(tx: TransactionSql, accountId: string, orderId: string) {
  const lines = await tx<{
    id: string;
    priceCents: number;
    listPriceCents: number;
    courtesy: boolean;
    packageCreditId: string | null;
  }[]>`
    SELECT id, price_cents AS "priceCents", list_price_cents AS "listPriceCents",
           courtesy, package_credit_id AS "packageCreditId"
    FROM order_lines
    WHERE order_id = ${orderId} AND account_id = ${accountId}
  `;
  for (const line of lines) {
    let base = line.priceCents;
    if (line.packageCreditId) {
      const credit = await tx<{ internal: number }[]>`
        SELECT internal_price_cents AS internal FROM package_credits WHERE id = ${line.packageCreditId}
      `;
      base = credit[0]?.internal ?? 0;
    } else if (line.courtesy) {
      base = line.listPriceCents;
    }
    await stampReferral(tx, accountId, orderId, line.id, base);
  }
}
