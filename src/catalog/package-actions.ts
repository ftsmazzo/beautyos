"use server";

import { randomUUID } from "crypto";
import { requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { checked, parseIntField, parsePercent, parseReais, textOrNull } from "@/catalog/format";
import { settle } from "@/catalog/settle";
import { db } from "@/db/client";

export async function savePackage(formData: FormData) {
  const user = await requireOperator();
  const existingId = String(formData.get("id") ?? "");
  const failBase = existingId ? `/pacotes/${existingId}` : "/pacotes/novo";
  return settle(failBase, async () => {
    const name = String(formData.get("name") ?? "").trim();
    const serviceId = String(formData.get("service_id") ?? "");
    const days = parseIntField(formData.get("validity_days"));
    const commissionRaw = String(formData.get("sale_commission") ?? "").trim();
    const commission = commissionRaw ? parsePercent(formData.get("sale_commission")) : null;
    const visitPrices = formData.getAll("visit_price").map((value) => parseReais(String(value)));
    if (name.length < 2 || days == null || days < 1 || days > 3650 || (commissionRaw && commission == null)) {
      throw new FormError("dados");
    }
    if (!visitPrices.length || visitPrices.some((price) => price == null)) throw new FormError("soma");

    const productIds = formData.getAll("product_id").map(String);
    const productQty = formData.getAll("product_qty").map((value) => parseIntField(value));
    const productPrices = formData.getAll("product_price").map((value) => parseReais(String(value)));
    if (productIds.length !== productQty.length || productIds.length !== productPrices.length) throw new FormError("soma");

    const id = await db().begin(async (tx) => {
      const service = await tx`SELECT id FROM services WHERE id = ${serviceId} AND account_id = ${user.accountId}`;
      if (!service.length) throw new FormError("soma");
      const lines: { kind: "service" | "product"; serviceId: string | null; productId: string | null; qty: number; cents: number }[] = [];
      for (const cents of visitPrices) {
        lines.push({ kind: "service", serviceId, productId: null, qty: 1, cents: cents as number });
      }
      const seen = new Set<string>();
      for (let index = 0; index < productIds.length; index++) {
        const productId = productIds[index];
        if (!productId) {
          if (String(formData.getAll("product_price")[index] ?? "").trim()) throw new FormError("soma");
          continue;
        }
        if (seen.has(productId)) throw new FormError("soma");
        seen.add(productId);
        const qty = productQty[index];
        const cents = productPrices[index];
        const found = await tx`SELECT id FROM products WHERE id = ${productId} AND account_id = ${user.accountId}`;
        if (!found.length || qty == null || qty < 1 || cents == null) throw new FormError("soma");
        lines.push({ kind: "product", serviceId: null, productId, qty, cents });
      }
      const price = lines.reduce((sum, line) => sum + line.cents, 0);
      let packageId = existingId;
      if (packageId) {
        const owned = await tx`SELECT id FROM packages WHERE id = ${packageId} AND account_id = ${user.accountId}`;
        if (!owned.length) throw new FormError("fora");
        await tx`
          UPDATE packages SET
            name = ${name}, notes = ${textOrNull(formData.get("notes"))}, for_sale = ${checked(formData, "for_sale")},
            validity_days = ${days}, sale_commission_percent = ${commission}, price_cents = ${price}
          WHERE id = ${packageId}
        `;
        await tx`DELETE FROM package_items WHERE package_id = ${packageId}`;
      } else {
        packageId = randomUUID();
        await tx`
          INSERT INTO packages (id, account_id, name, notes, for_sale, validity_days, sale_commission_percent, price_cents)
          VALUES (
            ${packageId}, ${user.accountId}, ${name}, ${textOrNull(formData.get("notes"))},
            ${checked(formData, "for_sale")}, ${days}, ${commission}, ${price}
          )
        `;
      }
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        await tx`
          INSERT INTO package_items (id, package_id, position, kind, service_id, product_id, qty, internal_price_cents)
          VALUES (
            ${randomUUID()}, ${packageId}, ${index}, ${line.kind}, ${line.serviceId}, ${line.productId}, ${line.qty}, ${line.cents}
          )
        `;
      }
      return packageId;
    });
    return `/pacotes?ok=salvo`;
  });
}
