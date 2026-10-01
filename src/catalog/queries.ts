import { db } from "@/db/client";

export async function applyDuePrices(accountId: string) {
  await db()`
    UPDATE services
    SET price_cents = next_price_cents,
        price_changed_on = (timezone('America/Sao_Paulo', now()))::date,
        next_price_cents = NULL,
        next_price_on = NULL
    WHERE account_id = ${accountId}
      AND next_price_on IS NOT NULL
      AND next_price_on <= (timezone('America/Sao_Paulo', now()))::date
      AND next_price_cents IS NOT NULL
  `;
}

export async function houseRules(accountId: string) {
  const rows = await db()<{ referral: number; consumption: number }[]>`
    SELECT referral_commission_percent AS referral,
           staff_consumption_percent AS consumption
    FROM accounts
    WHERE id = ${accountId}
  `;
  return rows[0] ?? { referral: 0, consumption: 30 };
}

export async function catalogCounts(accountId: string) {
  const rows = await db()<{
    services: number;
    professionals: number;
    clients: number;
    products: number;
    packages: number;
  }[]>`
    SELECT
      (SELECT count(*) FROM services WHERE account_id = ${accountId})::int AS services,
      (SELECT count(*) FROM professionals WHERE account_id = ${accountId})::int AS professionals,
      (SELECT count(*) FROM clients WHERE account_id = ${accountId} AND active)::int AS clients,
      (SELECT count(*) FROM products WHERE account_id = ${accountId})::int AS products,
      (SELECT count(*) FROM packages WHERE account_id = ${accountId})::int AS packages
  `;
  return rows[0];
}

export type ServiceRow = {
  id: string;
  name: string;
  notes: string | null;
  active: boolean;
  bookable: boolean;
  durationMin: number;
  priceCents: number;
  commissionPercent: number;
  returnDays: number | null;
  extrasGoal: boolean;
  menuGroup: string | null;
  nextPriceCents: number | null;
  nextPriceOn: string | null;
  priceChangedOn: string | null;
};

const serviceColumns = `
  id, name, notes, active, bookable,
  duration_min AS "durationMin",
  price_cents AS "priceCents",
  commission_percent AS "commissionPercent",
  return_days AS "returnDays",
  extras_goal AS "extrasGoal",
  menu_group AS "menuGroup",
  next_price_cents AS "nextPriceCents",
  to_char(next_price_on, 'YYYY-MM-DD') AS "nextPriceOn",
  to_char(price_changed_on, 'YYYY-MM-DD') AS "priceChangedOn"
`;

export async function listServices(accountId: string) {
  await applyDuePrices(accountId);
  return db()<ServiceRow[]>`
    SELECT ${db().unsafe(serviceColumns)}
    FROM services
    WHERE account_id = ${accountId}
    ORDER BY menu_group NULLS LAST, name
  `;
}

export async function getService(accountId: string, id: string) {
  await applyDuePrices(accountId);
  const rows = await db()<ServiceRow[]>`
    SELECT ${db().unsafe(serviceColumns)}
    FROM services
    WHERE account_id = ${accountId} AND id = ${id}
  `;
  return rows[0] ?? null;
}

export async function serviceGroups(accountId: string) {
  const rows = await db()<{ name: string }[]>`
    SELECT DISTINCT menu_group AS name
    FROM services
    WHERE account_id = ${accountId} AND menu_group IS NOT NULL AND menu_group <> ''
    ORDER BY 1
  `;
  return rows.map((row) => row.name);
}

export type DiscountRow = {
  id: string;
  weekday: number;
  startTime: string | null;
  endTime: string | null;
  mode: string;
  amount: number;
};

export async function listDiscounts(serviceId: string) {
  return db()<DiscountRow[]>`
    SELECT id, weekday, start_time AS "startTime", end_time AS "endTime", mode, amount
    FROM service_discounts
    WHERE service_id = ${serviceId}
    ORDER BY weekday, start_time NULLS FIRST
  `;
}

export type SupplyRow = { productId: string; name: string; qty: number };

export async function listSupplies(serviceId: string) {
  return db()<SupplyRow[]>`
    SELECT s.product_id AS "productId", p.name, s.qty
    FROM service_supplies s
    JOIN products p ON p.id = s.product_id
    WHERE s.service_id = ${serviceId}
    ORDER BY p.name
  `;
}

export type ProfessionalRow = {
  id: string;
  userId: string | null;
  name: string;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
  bookable: boolean;
  columnColor: string;
  birthDate: string | null;
};

export async function listProfessionals(accountId: string) {
  return db()<ProfessionalRow[]>`
    SELECT id, user_id AS "userId", name, nickname, phone, email, notes, active, bookable,
           column_color AS "columnColor",
           to_char(birth_date, 'YYYY-MM-DD') AS "birthDate"
    FROM professionals
    WHERE account_id = ${accountId}
    ORDER BY name
  `;
}

export async function getProfessional(accountId: string, id: string) {
  const rows = await db()<ProfessionalRow[]>`
    SELECT id, user_id AS "userId", name, nickname, phone, email, notes, active, bookable,
           column_color AS "columnColor",
           to_char(birth_date, 'YYYY-MM-DD') AS "birthDate"
    FROM professionals
    WHERE account_id = ${accountId} AND id = ${id}
  `;
  return rows[0] ?? null;
}

export type ProServiceRow = {
  serviceId: string;
  priceCents: number | null;
  durationMin: number | null;
  commissionPercent: number | null;
};

export async function listProServices(professionalId: string) {
  return db()<ProServiceRow[]>`
    SELECT service_id AS "serviceId", price_cents AS "priceCents",
           duration_min AS "durationMin", commission_percent AS "commissionPercent"
    FROM professional_services
    WHERE professional_id = ${professionalId}
  `;
}

export type HourRow = {
  weekday: number;
  period: number;
  startTime: string;
  endTime: string;
  validFrom: string | null;
  validUntil: string | null;
};

export async function listHours(professionalId: string) {
  return db()<HourRow[]>`
    SELECT weekday, period, start_time AS "startTime", end_time AS "endTime",
           to_char(valid_from, 'YYYY-MM-DD') AS "validFrom",
           to_char(valid_until, 'YYYY-MM-DD') AS "validUntil"
    FROM professional_hours
    WHERE professional_id = ${professionalId}
    ORDER BY valid_from NULLS FIRST, weekday, period
  `;
}

export async function loginOptions(accountId: string, currentUserId: string | null) {
  return db()<{ id: string; name: string; email: string }[]>`
    SELECT u.id, u.name, u.email
    FROM users u
    WHERE u.account_id = ${accountId}
      AND u.role = 'profissional'
      AND (
        NOT EXISTS (SELECT 1 FROM professionals p WHERE p.user_id = u.id)
        OR u.id = ${currentUserId}
      )
    ORDER BY u.name
  `;
}

export type ClientRow = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  birthDate: string | null;
  notes: string | null;
  channel: string;
  fromOutside: boolean;
  incomplete: boolean;
  landline: string | null;
  cpf: string | null;
  rg: string | null;
  sex: string | null;
  address: string | null;
  referrerProfessionalId: string | null;
  referrerClientId: string | null;
  referralCommissionPercent: number | null;
  active: boolean;
};

export async function listClients(accountId: string, removed: boolean, q: string) {
  const term = q.replace(/[%_]/g, "").trim();
  const nameLike = `%${term}%`;
  const phoneDigits = term.replace(/\D/g, "");
  const phoneLike = `%${phoneDigits}%`;
  return db()<Pick<ClientRow, "id" | "name" | "phone" | "channel" | "fromOutside" | "incomplete" | "active">[]>`
    SELECT id, name, phone, channel, from_outside AS "fromOutside", incomplete, active
    FROM clients
    WHERE account_id = ${accountId}
      AND active = ${!removed}
      AND (
        ${term === ""}
        OR name ILIKE ${nameLike}
        OR (${phoneDigits !== ""} AND phone ILIKE ${phoneLike})
      )
    ORDER BY name
  `;
}

export async function getClient(accountId: string, id: string) {
  const rows = await db()<ClientRow[]>`
    SELECT id, name, phone, email,
           to_char(birth_date, 'YYYY-MM-DD') AS "birthDate",
           notes, channel, from_outside AS "fromOutside", incomplete,
           landline, cpf, rg, sex, address,
           referrer_professional_id AS "referrerProfessionalId",
           referrer_client_id AS "referrerClientId",
           referral_commission_percent AS "referralCommissionPercent",
           active
    FROM clients
    WHERE account_id = ${accountId} AND id = ${id}
  `;
  return rows[0] ?? null;
}

export type ProductRow = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  notes: string | null;
  barcode: string | null;
  active: boolean;
  sellsToClient: boolean;
  isSupply: boolean;
  salePriceCents: number;
  commissionPercent: number;
  costCents: number;
  minQty: number;
  supplierId: string | null;
  staffPriceCents: number | null;
  balance: number;
};

export async function listProducts(accountId: string) {
  return db()<ProductRow[]>`
    SELECT p.id, p.name, p.brand, p.category, p.notes, p.barcode, p.active,
           p.sells_to_client AS "sellsToClient", p.is_supply AS "isSupply",
           p.sale_price_cents AS "salePriceCents", p.commission_percent AS "commissionPercent",
           p.cost_cents AS "costCents", p.min_qty AS "minQty",
           p.supplier_id AS "supplierId", p.staff_price_cents AS "staffPriceCents",
           COALESCE((SELECT SUM(m.qty) FROM stock_movements m WHERE m.product_id = p.id), 0)::int AS balance
    FROM products p
    WHERE p.account_id = ${accountId}
    ORDER BY p.name
  `;
}

export async function getProduct(accountId: string, id: string) {
  const rows = await listProducts(accountId);
  return rows.find((row) => row.id === id) ?? null;
}

export async function productCategories(accountId: string) {
  const rows = await db()<{ name: string }[]>`
    SELECT DISTINCT category AS name
    FROM products
    WHERE account_id = ${accountId} AND category IS NOT NULL AND category <> ''
    ORDER BY 1
  `;
  return rows.map((row) => row.name);
}

export type SupplierRow = { id: string; name: string; phone: string | null; cnpj: string | null; city: string | null };

export async function listSuppliers(accountId: string) {
  return db()<SupplierRow[]>`
    SELECT id, name, phone, cnpj, city
    FROM suppliers
    WHERE account_id = ${accountId}
    ORDER BY name
  `;
}

export type ComponentRow = { componentId: string; name: string; qty: number };

export async function listComponents(productId: string) {
  return db()<ComponentRow[]>`
    SELECT c.component_id AS "componentId", p.name, c.qty
    FROM product_components c
    JOIN products p ON p.id = c.component_id
    WHERE c.product_id = ${productId}
    ORDER BY p.name
  `;
}

export type MovementRow = { qty: number; reason: string; note: string | null; at: string };

export async function listMovements(productId: string) {
  return db()<MovementRow[]>`
    SELECT qty, reason, note,
           to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS at
    FROM stock_movements
    WHERE product_id = ${productId}
    ORDER BY created_at DESC
    LIMIT 20
  `;
}

export type PackageListRow = {
  id: string;
  name: string;
  priceCents: number;
  forSale: boolean;
  validityDays: number;
  visits: number;
  internalCents: number;
  avulsoCents: number;
  serviceName: string | null;
};

export async function listPackages(accountId: string) {
  return db()<PackageListRow[]>`
    SELECT p.id, p.name, p.price_cents AS "priceCents", p.for_sale AS "forSale",
           p.validity_days AS "validityDays",
           (SELECT count(*) FROM package_items i WHERE i.package_id = p.id AND i.kind = 'service')::int AS visits,
           (SELECT COALESCE(SUM(i.internal_price_cents), 0) FROM package_items i WHERE i.package_id = p.id AND i.kind = 'service')::int AS "internalCents",
           (SELECT COALESCE(SUM(s.price_cents), 0) FROM package_items i JOIN services s ON s.id = i.service_id WHERE i.package_id = p.id AND i.kind = 'service')::int AS "avulsoCents",
           (SELECT s.name FROM package_items i JOIN services s ON s.id = i.service_id WHERE i.package_id = p.id AND i.kind = 'service' ORDER BY i.position LIMIT 1) AS "serviceName"
    FROM packages p
    WHERE p.account_id = ${accountId}
    ORDER BY p.name
  `;
}

export type PackageItemRow = {
  position: number;
  kind: string;
  serviceId: string | null;
  productId: string | null;
  qty: number;
  internalPriceCents: number;
};

export async function getPackage(accountId: string, id: string) {
  const rows = await db()<{
    id: string;
    name: string;
    notes: string | null;
    forSale: boolean;
    validityDays: number;
    saleCommissionPercent: number | null;
    priceCents: number;
  }[]>`
    SELECT id, name, notes, for_sale AS "forSale", validity_days AS "validityDays",
           sale_commission_percent AS "saleCommissionPercent", price_cents AS "priceCents"
    FROM packages
    WHERE account_id = ${accountId} AND id = ${id}
  `;
  if (!rows[0]) return null;
  const items = await db()<PackageItemRow[]>`
    SELECT position, kind, service_id AS "serviceId", product_id AS "productId",
           qty, internal_price_cents AS "internalPriceCents"
    FROM package_items
    WHERE package_id = ${id}
    ORDER BY position
  `;
  return { ...rows[0], items };
}
