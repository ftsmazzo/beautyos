"use server";

import { randomUUID } from "crypto";
import { requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { checked, digits, parseIntField, parsePercent, parseReais, textOrNull } from "@/catalog/format";

const PAYABLE_METHODS = ["dinheiro", "pix", "debito", "credito", "outros"];
import { settle } from "@/catalog/settle";
import { db } from "@/db/client";
import { dayParam, shiftMonth } from "@/desk/clock";

export async function saveProduct(formData: FormData) {
  const user = await requireOperator();
  const existingId = String(formData.get("id") ?? "");
  const failBase = existingId ? `/produtos/${existingId}` : "/produtos/novo";
  return settle(failBase, async () => {
    const name = String(formData.get("name") ?? "").trim();
    const sells = checked(formData, "sells");
    const supply = checked(formData, "supply");
    const price = parseReais(String(formData.get("price") ?? ""));
    const costRaw = String(formData.get("cost") ?? "").trim();
    const cost = costRaw ? parseReais(costRaw) : 0;
    const commissionRaw = String(formData.get("commission") ?? "").trim();
    const commission = commissionRaw ? parsePercent(formData.get("commission")) : 0;
    const minRaw = String(formData.get("min") ?? "").trim();
    const min = minRaw ? parseIntField(formData.get("min")) : 0;
    const staffRaw = String(formData.get("staff_price") ?? "").trim();
    const staff = staffRaw ? parseReais(staffRaw) : null;
    const barcode = String(formData.get("barcode") ?? "").trim() || null;
    if (name.length < 2 || price == null || cost == null || commission == null || min == null || min < 0) {
      throw new FormError("dados");
    }
    if (staffRaw && staff == null) throw new FormError("dados");
    if (!sells && !supply) throw new FormError("papel");

    const id = await db().begin(async (tx) => {
      let supplierId = String(formData.get("supplier") ?? "");
      const newSupplier = textOrNull(formData.get("supplier_name"));
      if (newSupplier) {
        supplierId = "";
        const cnpj = digits(String(formData.get("supplier_cnpj") ?? "")) || null;
        if (cnpj) {
          const same = await tx<{ id: string }[]>`
            SELECT id FROM suppliers WHERE account_id = ${user.accountId} AND cnpj = ${cnpj}
          `;
          supplierId = same[0]?.id ?? "";
        }
        if (!supplierId) {
          supplierId = randomUUID();
          await tx`
            INSERT INTO suppliers (id, account_id, name, phone, cnpj, city)
            VALUES (
              ${supplierId}, ${user.accountId}, ${newSupplier},
              ${textOrNull(formData.get("supplier_phone"))}, ${cnpj}, ${textOrNull(formData.get("supplier_city"))}
            )
          `;
        }
      }
      if (supplierId) {
        const found = await tx`SELECT id FROM suppliers WHERE id = ${supplierId} AND account_id = ${user.accountId}`;
        if (!found.length) throw new FormError("dados");
      }

      let productId = existingId;
      const house = await tx<{ consumption: number }[]>`
        SELECT staff_consumption_percent AS consumption FROM accounts WHERE id = ${user.accountId}
      `;
      const suggested = Math.round((price * (house[0]?.consumption ?? 30)) / 100);
      const values = {
        name,
        brand: textOrNull(formData.get("brand")),
        category: textOrNull(formData.get("category")),
        notes: textOrNull(formData.get("notes")),
        barcode,
        active: checked(formData, "active"),
        sells,
        supply,
        price,
        commission,
        cost,
        min,
        supplierId: supplierId || null,
        staff: staff === suggested ? null : staff,
      };
      if (productId) {
        const owned = await tx`SELECT id FROM products WHERE id = ${productId} AND account_id = ${user.accountId}`;
        if (!owned.length) throw new FormError("fora");
        await tx`
          UPDATE products SET
            name = ${values.name}, brand = ${values.brand}, category = ${values.category}, notes = ${values.notes},
            barcode = ${values.barcode}, active = ${values.active}, sells_to_client = ${values.sells},
            is_supply = ${values.supply}, sale_price_cents = ${values.price}, commission_percent = ${values.commission},
            cost_cents = ${values.cost}, min_qty = ${values.min}, supplier_id = ${values.supplierId},
            staff_price_cents = ${values.staff}
          WHERE id = ${productId}
        `;
      } else {
        productId = randomUUID();
        await tx`
          INSERT INTO products (
            id, account_id, name, brand, category, notes, barcode, active, sells_to_client, is_supply,
            sale_price_cents, commission_percent, cost_cents, min_qty, supplier_id, staff_price_cents
          ) VALUES (
            ${productId}, ${user.accountId}, ${values.name}, ${values.brand}, ${values.category}, ${values.notes},
            ${values.barcode}, ${values.active}, ${values.sells}, ${values.supply}, ${values.price},
            ${values.commission}, ${values.cost}, ${values.min}, ${values.supplierId}, ${values.staff}
          )
        `;
      }

      const drop = formData.getAll("drop_component").map(String).filter(Boolean);
      if (drop.length) {
        await tx`
          DELETE FROM product_components
          WHERE product_id = ${productId} AND component_id IN ${tx(drop)}
        `;
      }
      const componentId = String(formData.get("new_component") ?? "");
      const componentQtyRaw = String(formData.get("new_component_qty") ?? "").trim();
      if (componentId || componentQtyRaw) {
        const qty = parseIntField(formData.get("new_component_qty"));
        if (!componentId || componentId === productId || qty == null || qty < 1) throw new FormError("ciclo");
        const found = await tx`SELECT id FROM products WHERE id = ${componentId} AND account_id = ${user.accountId}`;
        const loop = await tx`
          SELECT 1 FROM product_components WHERE product_id = ${componentId} AND component_id = ${productId}
        `;
        if (!found.length || loop.length) throw new FormError("ciclo");
        await tx`
          INSERT INTO product_components (product_id, component_id, qty)
          VALUES (${productId}, ${componentId}, ${qty})
          ON CONFLICT (product_id, component_id) DO UPDATE SET qty = ${qty}
        `;
      }
      return productId;
    });
    return `/produtos?ok=salvo`;
  });
}

export async function moveStock(formData: FormData) {
  const user = await requireOperator();
  const productId = String(formData.get("id") ?? "");
  const failBase = `/produtos/${productId}`;
  return settle(failBase, async () => {
    const reason = String(formData.get("reason") ?? "");
    await db().begin(async (tx) => {
      const rows = await tx<{ balance: number }[]>`
        SELECT COALESCE(SUM(qty), 0)::int AS balance
        FROM stock_movements
        WHERE product_id = ${productId}
          AND account_id = ${user.accountId}
      `;
      const owned = await tx`SELECT id, cost_cents FROM products WHERE id = ${productId} AND account_id = ${user.accountId}`;
      if (!owned.length) throw new FormError("fora");
      let qty = 0;
      if (reason === "compra") {
        const amount = parseIntField(formData.get("qty"));
        const unit = parseReais(String(formData.get("unit") ?? ""));
        if (amount == null || amount < 1 || unit == null) throw new FormError("estoque");
        qty = amount;
        await tx`UPDATE products SET cost_cents = ${unit} WHERE id = ${productId}`;
      } else if (reason === "ajuste") {
        const amount = parseIntField(formData.get("qty"));
        if (amount == null || amount === 0) throw new FormError("estoque");
        qty = amount;
      } else if (reason === "conferencia") {
        const counted = parseIntField(formData.get("qty"));
        if (counted == null || counted < 0) throw new FormError("estoque");
        qty = counted - (rows[0]?.balance ?? 0);
        if (qty === 0) throw new FormError("igual");
      } else {
        throw new FormError("estoque");
      }
      await tx`
        INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by)
        VALUES (
          ${randomUUID()}, ${user.accountId}, ${productId}, ${qty}, ${reason},
          ${textOrNull(formData.get("note"))}, ${user.id}
        )
      `;
    });
    return `${failBase}?ok=movimento`;
  });
}

export async function savePurchase(formData: FormData) {
  const user = await requireOperator();
  return settle("/produtos/compra", async () => {
    const document = String(formData.get("document") ?? "").trim().replace(/\s+/g, " ").toUpperCase();
    const day = dayParam(String(formData.get("day") ?? ""));
    const chosen = String(formData.get("supplier") ?? "");
    const name = String(formData.get("supplier_name") ?? "").trim();
    const phone = digits(String(formData.get("supplier_phone") ?? "")) || null;
    const cnpj = digits(String(formData.get("supplier_cnpj") ?? "")) || null;
    const city = textOrNull(formData.get("supplier_city"));
    const productIds = formData.getAll("product").map(String);
    const qtys = formData.getAll("qty").map(String);
    const costs = formData.getAll("cost").map(String);
    const lines: { productId: string; qty: number; costCents: number }[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < productIds.length; index += 1) {
      const productId = productIds[index];
      if (!productId) continue;
      if (seen.has(productId)) throw new FormError("linha");
      seen.add(productId);
      const qty = parseIntField(qtys[index] ?? null);
      const costCents = parseReais(costs[index] ?? "");
      if (qty == null || qty < 1 || costCents == null) throw new FormError("estoque");
      lines.push({ productId, qty, costCents });
    }
    if (document.length < 1 || lines.length === 0) throw new FormError("dados");
    const bill = checked(formData, "bill");
    const due = String(formData.get("due") ?? "");
    const times = parseIntField(formData.get("times"));
    const paid = checked(formData, "paid");
    let method = String(formData.get("method") ?? "");
    let brand = textOrNull(formData.get("brand"));
    if (bill) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || times == null || times < 1 || times > 36) throw new FormError("dados");
      if (paid && !PAYABLE_METHODS.includes(method)) throw new FormError("dados");
      if (paid && (method === "debito" || method === "credito") && (!brand || brand.length < 2)) {
        throw new FormError("bandeira");
      }
      if (!paid) {
        method = "";
        brand = null;
      } else if (method !== "debito" && method !== "credito") {
        brand = null;
      }
      const totalCents = lines.reduce((sum, line) => sum + line.qty * line.costCents, 0);
      if (totalCents < 1) throw new FormError("dados");
    }
    await db().begin(async (tx) => {
      let supplierId = "";
      if (chosen) {
        const found = await tx<{ id: string }[]>`
          SELECT id FROM suppliers WHERE id = ${chosen} AND account_id = ${user.accountId}
        `;
        if (!found[0]) throw new FormError("fora");
        supplierId = found[0].id;
      } else {
        if (name.length < 2) throw new FormError("dados");
        if (cnpj) {
          const sameCnpj = await tx<{ id: string }[]>`
            SELECT id FROM suppliers WHERE account_id = ${user.accountId} AND cnpj = ${cnpj} LIMIT 1
          `;
          supplierId = sameCnpj[0]?.id ?? "";
        }
        if (!supplierId) {
          const sameName = await tx<{ id: string }[]>`
            SELECT id FROM suppliers
            WHERE account_id = ${user.accountId} AND lower(name) = ${name.toLowerCase()}
            LIMIT 1
          `;
          supplierId = sameName[0]?.id ?? "";
        }
        if (!supplierId) {
          supplierId = randomUUID();
          await tx`
            INSERT INTO suppliers (id, account_id, name, phone, cnpj, city)
            VALUES (${supplierId}, ${user.accountId}, ${name}, ${phone}, ${cnpj}, ${city})
          `;
        }
      }
      const owned = await tx<{ id: string }[]>`
        SELECT id FROM products
        WHERE account_id = ${user.accountId} AND id IN ${tx(lines.map((line) => line.productId))}
      `;
      if (owned.length !== lines.length) throw new FormError("fora");
      const duplicate = await tx`
        SELECT id FROM purchases
        WHERE account_id = ${user.accountId} AND supplier_id = ${supplierId} AND document = ${document}
      `;
      if (duplicate.length) throw new FormError("nota");
      const purchaseId = randomUUID();
      await tx`
        INSERT INTO purchases (id, account_id, supplier_id, document, purchased_on, created_by)
        VALUES (${purchaseId}, ${user.accountId}, ${supplierId}, ${document}, ${day}::date, ${user.id})
      `;
      for (const line of lines) {
        await tx`
          INSERT INTO purchase_lines (id, purchase_id, product_id, qty, cost_cents)
          VALUES (${randomUUID()}, ${purchaseId}, ${line.productId}, ${line.qty}, ${line.costCents})
        `;
        await tx`
          INSERT INTO stock_movements (id, account_id, product_id, qty, reason, note, created_by)
          VALUES (
            ${randomUUID()}, ${user.accountId}, ${line.productId}, ${line.qty}, 'compra',
            ${`nota ${document} · ${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`}, ${user.id}
          )
        `;
        await tx`
          UPDATE products
          SET cost_cents = ${line.costCents}, supplier_id = ${supplierId}
          WHERE id = ${line.productId} AND account_id = ${user.accountId}
        `;
      }
      if (bill && times != null) {
        const totalCents = lines.reduce((sum, line) => sum + line.qty * line.costCents, 0);
        const party = await tx<{ name: string }[]>`SELECT name FROM suppliers WHERE id = ${supplierId}`;
        const partyName = party[0]?.name ?? "Fornecedor";
        const base = Math.floor(totalCents / times);
        const rest = totalCents - base * times;
        for (let index = 1; index <= times; index += 1) {
          const amount = base + (index === times ? rest : 0);
          await tx`
            INSERT INTO payables (
              id, account_id, purchase_id, supplier_id, description, party_name,
              amount_cents, due_on, installment_index, installment_total,
              method, card_brand, paid_on, created_by
            )
            VALUES (
              ${randomUUID()}, ${user.accountId}, ${purchaseId}, ${supplierId},
              ${times === 1 ? `Nota ${document}` : `Nota ${document} · ${index}/${times}`},
              ${partyName}, ${amount}, ${shiftMonth(due, index - 1)}::date,
              ${index}, ${times},
              ${paid ? method : null}, ${paid ? brand : null}, ${paid ? day : null}::date,
              ${user.id}
            )
          `;
        }
      }
    });
    return "/produtos/compra?ok=compra";
  });
}
