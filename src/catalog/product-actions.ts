"use server";

import { randomUUID } from "crypto";
import { requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { checked, digits, parseIntField, parsePercent, parseReais, staffPriceCents, textOrNull, todaySaoPaulo } from "@/catalog/format";
import { couponUrl, draftFromRaw, fetchCoupon, rawFromCouponQr, readInvoiceFile } from "@/catalog/invoice";
import { listProducts, listSupplierLabels, listSuppliers } from "@/catalog/queries";

const PAYABLE_METHODS = ["dinheiro", "pix", "debito", "credito", "outros"];

function labelKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    let staff = staffRaw ? parseReais(staffRaw) : null;
    const barcode = String(formData.get("barcode") ?? "").trim() || null;
    if (name.length < 2 || price == null || cost == null || commission == null || min == null || min < 0) {
      throw new FormError("dados");
    }
    if (staffRaw && staff == null) throw new FormError("dados");
    const house = await db()<{ consumption: number }[]>`
      SELECT staff_consumption_percent AS consumption FROM accounts WHERE id = ${user.accountId}
    `;
    if (staff != null && staff === staffPriceCents(price, null, house[0]?.consumption ?? 30)) staff = null;
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
      const people = await tx<{ id: string }[]>`
        SELECT id FROM professionals WHERE account_id = ${user.accountId} AND active
      `;
      await tx`DELETE FROM professional_products WHERE product_id = ${productId}`;
      for (const person of people) {
        const raw = String(formData.get(`pro_${person.id}`) ?? "").trim();
        if (!raw) continue;
        const percent = parsePercent(raw);
        if (percent == null) throw new FormError("dados");
        if (percent === values.commission) continue;
        await tx`
          INSERT INTO professional_products (professional_id, product_id, commission_percent)
          VALUES (${person.id}, ${productId}, ${percent})
        `;
      }
      return productId;
    });
    return `/produtos?ok=salvo`;
  });
}

export async function deleteProduct(formData: FormData) {
  const user = await requireOperator();
  const productId = String(formData.get("id") ?? "");
  return settle(`/produtos/${productId}`, async () => {
    const owned = await db()`SELECT id FROM products WHERE id = ${productId} AND account_id = ${user.accountId}`;
    if (!owned.length) throw new FormError("fora");
    const used = await db()`
      SELECT 1 FROM order_lines WHERE product_id = ${productId} AND account_id = ${user.accountId}
      UNION ALL
      SELECT 1 FROM purchase_lines pl
      JOIN purchases pu ON pu.id = pl.purchase_id
      WHERE pl.product_id = ${productId} AND pu.account_id = ${user.accountId}
      UNION ALL
      SELECT 1 FROM package_items i
      JOIN packages p ON p.id = i.package_id
      WHERE i.product_id = ${productId} AND p.account_id = ${user.accountId}
      LIMIT 1
    `;
    if (used.length) throw new FormError("produto");
    await db()`DELETE FROM products WHERE id = ${productId} AND account_id = ${user.accountId}`;
    return "/produtos?ok=salvo";
  });
}

export async function moveStock(formData: FormData) {
  const user = await requireOperator();
  const productId = String(formData.get("id") ?? "");
  const back = String(formData.get("back") ?? "");
  const onList = back === "lista" || back === "conferencia";
  const failBase = onList ? "/produtos" : `/produtos/${productId}`;
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
        const sign = String(formData.get("sign") ?? "");
        qty = sign === "out" ? -Math.abs(amount) : amount;
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
    if (back === "conferencia") return "/produtos?modo=conferencia&ok=movimento";
    if (back === "lista") return "/produtos?ok=movimento";
    return `${failBase}?ok=movimento`;
  });
}

export async function readInvoice(formData: FormData) {
  const user = await requireOperator();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 32 || file.size > 8_000_000) return { ok: false as const, error: "arquivo" };
  const mime = file.type || "";
  const image = mime.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(file.name);
  if (image && file.size > 4_000_000) return { ok: false as const, error: "arquivo" };
  const raw = await readInvoiceFile(file.name, mime, new Uint8Array(await file.arrayBuffer()));
  if (!raw || (!raw.document && !raw.supplierName && !raw.cnpj && raw.lines.length === 0)) {
    return { ok: false as const, error: "leitura" };
  }
  return { ok: true as const, draft: await draftFor(user.accountId, raw) };
}

async function draftFor(
  accountId: string,
  raw: {
    supplierName: string;
    cnpj: string;
    document: string;
    day: string;
    lines: { label: string; qty: number; costCents: number; barcode?: string }[];
  },
) {
  const [products, suppliers, aliases] = await Promise.all([
    listProducts(accountId),
    listSuppliers(accountId),
    listSupplierLabels(accountId),
  ]);
  const draft = draftFromRaw(
    {
      ...raw,
      lines: raw.lines.map((line) => ({ ...line, barcode: line.barcode ?? "" })),
    },
    suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, cnpj: supplier.cnpj })),
    products.filter((product) => product.active).map((product) => ({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
    })),
    aliases,
  );
  if (!draft.day) draft.day = todaySaoPaulo();
  return draft;
}

export async function readCoupon(payload: string, photoJpeg = "") {
  const user = await requireOperator();
  if (!couponUrl(payload) && !rawFromCouponQr(payload)) {
    return { ok: false as const, error: "cupom" as const };
  }
  let raw: Awaited<ReturnType<typeof fetchCoupon>> = null;
  try {
    raw = await fetchCoupon(payload);
  } catch {
    raw = null;
  }
  if (raw && raw.lines.length > 0) {
    return { ok: true as const, draft: await draftFor(user.accountId, raw), partial: false as const };
  }
  if (photoJpeg.startsWith("data:image/")) {
    const bytes = Buffer.from(photoJpeg.replace(/^data:image\/\w+;base64,/, ""), "base64");
    if (bytes.length > 80 && bytes.length < 900_000) {
      const fromPhoto = await readInvoiceFile("cupom.jpg", "image/jpeg", bytes);
      if (fromPhoto && fromPhoto.lines.length > 0) {
        const header = rawFromCouponQr(payload);
        if (header) {
          fromPhoto.cnpj = fromPhoto.cnpj || header.cnpj;
          fromPhoto.document = fromPhoto.document || header.document;
          fromPhoto.day = fromPhoto.day || header.day;
        }
        return { ok: true as const, draft: await draftFor(user.accountId, fromPhoto), partial: false as const };
      }
    }
  }
  const header = rawFromCouponQr(payload);
  if (header) {
    return {
      ok: true as const,
      draft: await draftFor(user.accountId, header),
      partial: true as const,
    };
  }
  return { ok: false as const, error: "consulta" as const };
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
    const labels = formData.getAll("label").map(String);
    const barcodes = formData.getAll("barcode").map(String);
    const lines: { productId: string; create: boolean; qty: number; costCents: number; label: string; barcode: string }[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < productIds.length; index += 1) {
      const productId = productIds[index];
      if (!productId) continue;
      const create = productId === "__new__";
      if (!create) {
        if (seen.has(productId)) throw new FormError("linha");
        seen.add(productId);
      }
      const qty = parseIntField(qtys[index] ?? null);
      const costCents = parseReais(costs[index] ?? "");
      const label = labelKey(labels[index] ?? "");
      const barcode = digits(barcodes[index] ?? "").slice(0, 32);
      if (qty == null || qty < 1 || costCents == null) throw new FormError("estoque");
      if (create && label.length < 2) throw new FormError("dados");
      lines.push({ productId: create ? "" : productId, create, qty, costCents, label, barcode });
    }
    if (document.length < 1 || lines.length === 0) throw new FormError("dados");
    const bill = checked(formData, "bill");
    const due = String(formData.get("due") ?? "");
    const times = parseIntField(formData.get("times"));
    const paid = checked(formData, "paid");
    let method = String(formData.get("method") ?? "");
    let brand = textOrNull(formData.get("brand"));
    let bankId = String(formData.get("bank") ?? "");
    let cardId = String(formData.get("card") ?? "");
    let chartId = String(formData.get("chart") ?? "");
    if (bill) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(due) || times == null || times < 1 || times > 36) throw new FormError("dados");
      if (paid && !PAYABLE_METHODS.includes(method)) throw new FormError("dados");
      if (paid && (method === "debito" || method === "credito") && (!brand || brand.length < 2)) {
        throw new FormError("bandeira");
      }
      if (!paid) {
        method = "";
        brand = null;
        bankId = "";
        cardId = "";
      } else if (method === "credito") {
        bankId = "";
      } else {
        cardId = "";
      }
      if (paid && method !== "debito" && method !== "credito") {
        brand = null;
      }
      const totalCents = lines.reduce((sum, line) => sum + line.qty * line.costCents, 0);
      if (totalCents < 1) throw new FormError("dados");
    } else {
      chartId = "";
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
      for (const line of lines) {
        if (!line.create) continue;
        if (line.barcode) {
          const byCode = await tx<{ id: string }[]>`
            SELECT id FROM products
            WHERE account_id = ${user.accountId} AND barcode = ${line.barcode}
            LIMIT 1
          `;
          if (byCode[0]) {
            if (seen.has(byCode[0].id)) throw new FormError("linha");
            seen.add(byCode[0].id);
            line.productId = byCode[0].id;
            line.create = false;
            continue;
          }
        }
        const productId = randomUUID();
        await tx`
          INSERT INTO products (
            id, account_id, name, barcode, active, sells_to_client, is_supply,
            sale_price_cents, commission_percent, cost_cents, min_qty, supplier_id
          ) VALUES (
            ${productId}, ${user.accountId}, ${line.label.slice(0, 120)},
            ${line.barcode || null}, true, false, true,
            0, 0, ${line.costCents}, 0, ${supplierId}
          )
        `;
        line.productId = productId;
        line.create = false;
        seen.add(productId);
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
        if (line.label.length >= 2) {
          await tx`
            INSERT INTO supplier_labels (id, account_id, supplier_id, label, product_id)
            VALUES (${randomUUID()}, ${user.accountId}, ${supplierId}, ${line.label}, ${line.productId})
            ON CONFLICT (supplier_id, label) DO UPDATE SET product_id = EXCLUDED.product_id
          `;
        }
      }
      if (bill && times != null) {
        if (bankId) {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bankId)) throw new FormError("dados");
          const bank = await tx`SELECT id FROM bank_accounts WHERE id = ${bankId} AND account_id = ${user.accountId} AND active`;
          if (!bank.length) throw new FormError("fora");
        }
        if (cardId) {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cardId)) throw new FormError("dados");
          const card = await tx`SELECT id FROM credit_cards WHERE id = ${cardId} AND account_id = ${user.accountId} AND active`;
          if (!card.length) throw new FormError("fora");
        }
        if (chartId) {
          if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(chartId)) throw new FormError("dados");
          const chart = await tx`SELECT id FROM chart_accounts WHERE id = ${chartId} AND account_id = ${user.accountId} AND active`;
          if (!chart.length) throw new FormError("fora");
        }
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
              method, card_brand, paid_on, bank_account_id, credit_card_id, chart_account_id, created_by
            )
            VALUES (
              ${randomUUID()}, ${user.accountId}, ${purchaseId}, ${supplierId},
              ${times === 1 ? `Nota ${document}` : `Nota ${document} · ${index}/${times}`},
              ${partyName}, ${amount}, ${shiftMonth(due, index - 1)}::date,
              ${index}, ${times},
              ${paid ? method : null}, ${paid ? brand : null}, ${paid ? day : null}::date,
              ${bankId || null}, ${cardId || null}, ${chartId || null}, ${user.id}
            )
          `;
        }
      }
    });
    return "/produtos/compra?ok=compra";
  });
}

export async function saveSupplier(formData: FormData) {
  const user = await requireOperator();
  const existingId = String(formData.get("id") ?? "");
  const id = UUID.test(existingId) ? existingId : "";
  const failBase = id ? `/fornecedores/${id}` : "/fornecedores/novo";
  return settle(failBase, async () => {
    const name = String(formData.get("name") ?? "").trim();
    const phone = digits(String(formData.get("phone") ?? "")) || null;
    const cnpj = digits(String(formData.get("cnpj") ?? "")) || null;
    const city = textOrNull(formData.get("city"));
    if (name.length < 2) throw new FormError("dados");
    if (cnpj) {
      const same = await db()<{ id: string }[]>`
        SELECT id FROM suppliers WHERE account_id = ${user.accountId} AND cnpj = ${cnpj}
      `;
      if (same.some((row) => row.id !== id)) throw new FormError("cnpj");
    }
    if (id) {
      const owned = await db()`SELECT id FROM suppliers WHERE id = ${id} AND account_id = ${user.accountId}`;
      if (!owned.length) throw new FormError("fora");
      await db()`
        UPDATE suppliers SET name = ${name}, phone = ${phone}, cnpj = ${cnpj}, city = ${city}
        WHERE id = ${id}
      `;
    } else {
      await db()`
        INSERT INTO suppliers (id, account_id, name, phone, cnpj, city)
        VALUES (${randomUUID()}, ${user.accountId}, ${name}, ${phone}, ${cnpj}, ${city})
      `;
    }
    return "/fornecedores?ok=salvo";
  });
}

export async function deleteSupplier(formData: FormData) {
  const user = await requireOperator();
  const id = String(formData.get("id") ?? "");
  return settle("/fornecedores", async () => {
    if (!UUID.test(id)) throw new FormError("fora");
    const owned = await db()`SELECT id FROM suppliers WHERE id = ${id} AND account_id = ${user.accountId}`;
    if (!owned.length) throw new FormError("fora");
    const used = await db()`
      SELECT id FROM purchases WHERE supplier_id = ${id}
      UNION ALL
      SELECT id FROM products WHERE supplier_id = ${id}
      UNION ALL
      SELECT id FROM payables WHERE supplier_id = ${id}
      LIMIT 1
    `;
    if (used.length) throw new FormError("fornecedor");
    await db()`DELETE FROM supplier_labels WHERE supplier_id = ${id}`;
    await db()`DELETE FROM suppliers WHERE id = ${id} AND account_id = ${user.accountId}`;
    return "/fornecedores";
  });
}

export async function saveSupplierLabel(formData: FormData) {
  const user = await requireOperator();
  const supplierId = String(formData.get("supplier") ?? "");
  return settle(`/fornecedores/${supplierId}`, async () => {
    if (!UUID.test(supplierId)) throw new FormError("fora");
    const productId = String(formData.get("product") ?? "");
    const label = labelKey(String(formData.get("label") ?? ""));
    if (!UUID.test(productId) || label.length < 2) throw new FormError("dados");
    const supplier = await db()`SELECT id FROM suppliers WHERE id = ${supplierId} AND account_id = ${user.accountId}`;
    if (!supplier.length) throw new FormError("fora");
    const product = await db()`SELECT id FROM products WHERE id = ${productId} AND account_id = ${user.accountId}`;
    if (!product.length) throw new FormError("fora");
    await db()`
      INSERT INTO supplier_labels (id, account_id, supplier_id, label, product_id)
      VALUES (${randomUUID()}, ${user.accountId}, ${supplierId}, ${label}, ${productId})
      ON CONFLICT (supplier_id, label) DO UPDATE SET product_id = EXCLUDED.product_id
    `;
    return `/fornecedores/${supplierId}?ok=salvo`;
  });
}

export async function deleteSupplierLabel(formData: FormData) {
  const user = await requireOperator();
  const supplierId = String(formData.get("supplier") ?? "");
  const id = String(formData.get("id") ?? "");
  return settle(`/fornecedores/${supplierId}`, async () => {
    if (!UUID.test(supplierId) || !UUID.test(id)) throw new FormError("fora");
    await db()`
      DELETE FROM supplier_labels
      WHERE id = ${id} AND supplier_id = ${supplierId} AND account_id = ${user.accountId}
    `;
    return `/fornecedores/${supplierId}?ok=salvo`;
  });
}
