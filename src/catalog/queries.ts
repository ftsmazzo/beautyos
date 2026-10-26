import { randomUUID } from "crypto";
import { formatReais } from "@/catalog/format";
import { HOUSE_MODULES, type HouseModuleId } from "@/catalog/modules";
import { db } from "@/db/client";
import { shiftDay } from "@/desk/clock";
import { chargedServicePrice } from "@/desk/pricing";
import { restampOrder } from "@/desk/referral";

export async function applyDuePrices(accountId: string) {
  await db().begin(async (tx) => {
    const due = await tx<{ id: string; name: string; beforeCents: number; afterCents: number; changeOn: string }[]>`
      SELECT id, name, price_cents AS "beforeCents", next_price_cents AS "afterCents",
             to_char(next_price_on, 'YYYY-MM-DD') AS "changeOn"
      FROM services
      WHERE account_id = ${accountId}
        AND next_price_on IS NOT NULL
        AND next_price_on <= (timezone('America/Sao_Paulo', now()))::date
        AND next_price_cents IS NOT NULL
    `;
    for (const row of due) {
      const lines = await tx<{
        id: string;
        orderId: string;
        appointmentId: string;
        description: string;
        priceCents: number;
        listPriceCents: number;
        commissionPercent: number;
        courtesy: boolean;
        day: string;
        start: string;
      }[]>`
        SELECT l.id, l.order_id AS "orderId", l.appointment_id AS "appointmentId", l.description,
               l.price_cents AS "priceCents", l.list_price_cents AS "listPriceCents",
               l.commission_percent AS "commissionPercent", l.courtesy,
               to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS day,
               to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start
        FROM order_lines l
        JOIN orders o ON o.id = l.order_id AND o.status = 'aberta' AND o.kind = 'cliente'
        JOIN appointments a ON a.id = l.appointment_id AND a.status <> 'cancelado'
        WHERE l.account_id = ${accountId}
          AND l.service_id = ${row.id}
          AND l.kind = 'servico'
          AND l.package_credit_id IS NULL
          AND l.list_price_cents = ${row.beforeCents}
          AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${row.changeOn}::date
      `;
      const touched = new Set<string>();
      for (const line of lines) {
        const oldCharged = await chargedServicePrice(tx, row.id, line.day, line.start, row.beforeCents);
        const follows = line.courtesy || line.priceCents === row.beforeCents || line.priceCents === oldCharged;
        if (!follows) continue;
        const next = line.courtesy ? 0 : await chargedServicePrice(tx, row.id, line.day, line.start, row.afterCents);
        const base = line.courtesy ? row.afterCents : next;
        const commission = Math.round(base * line.commissionPercent / 100);
        await tx`
          UPDATE order_lines
          SET list_price_cents = ${row.afterCents}, price_cents = ${next}, commission_cents = ${commission}
          WHERE id = ${line.id}
        `;
        await tx`
          INSERT INTO order_events (
            id, account_id, order_id, line_id, appointment_id, actor_id, kind, summary, before_cents, after_cents
          ) VALUES (
            ${randomUUID()}, ${accountId}, ${line.orderId}, ${line.id}, ${line.appointmentId},
            ${null}, 'valor',
            ${`${line.description} passou de ${formatReais(line.courtesy ? line.listPriceCents : line.priceCents)} para ${formatReais(base)} na troca de preço. Comissão ${formatReais(commission)}.`},
            ${line.courtesy ? line.listPriceCents : line.priceCents}, ${base}
          )
        `;
        touched.add(line.orderId);
      }
      await tx`
        UPDATE services
        SET price_cents = ${row.afterCents},
            price_changed_on = (timezone('America/Sao_Paulo', now()))::date,
            next_price_cents = NULL,
            next_price_on = NULL
        WHERE id = ${row.id} AND account_id = ${accountId}
      `;
      await tx`
        INSERT INTO price_notices (id, account_id, service_id, service_name, before_cents, after_cents, changed_on)
        VALUES (
          ${randomUUID()}, ${accountId}, ${row.id}, ${row.name}, ${row.beforeCents}, ${row.afterCents},
          (timezone('America/Sao_Paulo', now()))::date
        )
      `;
      for (const orderId of touched) await restampOrder(tx, accountId, orderId);
    }
  });
}

export async function birthdaysOn(accountId: string, day: string) {
  const month = Number(day.slice(5, 7));
  const date = Number(day.slice(8, 10));
  const [clients, professionals] = await Promise.all([
    db()<{ id: string; name: string }[]>`
      SELECT id, name
      FROM clients
      WHERE account_id = ${accountId}
        AND active
        AND birth_date IS NOT NULL
        AND EXTRACT(MONTH FROM birth_date) = ${month}
        AND EXTRACT(DAY FROM birth_date) = ${date}
      ORDER BY name
    `,
    db()<{ id: string; name: string }[]>`
      SELECT id, COALESCE(nickname, name) AS name
      FROM professionals
      WHERE account_id = ${accountId}
        AND active
        AND birth_date IS NOT NULL
        AND EXTRACT(MONTH FROM birth_date) = ${month}
        AND EXTRACT(DAY FROM birth_date) = ${date}
      ORDER BY name
    `,
  ]);
  return { clients, professionals };
}

export async function birthdaysAhead(accountId: string, fromDay: string, span = 14) {
  const [clients, professionals] = await Promise.all([
    db()<{ id: string; name: string; phone: string; month: number; date: number; year: number }[]>`
      SELECT id, name, phone,
             EXTRACT(MONTH FROM birth_date)::int AS month,
             EXTRACT(DAY FROM birth_date)::int AS date,
             EXTRACT(YEAR FROM birth_date)::int AS year
      FROM clients
      WHERE account_id = ${accountId} AND active AND birth_date IS NOT NULL
    `,
    db()<{ id: string; name: string; phone: string | null; month: number; date: number; year: number }[]>`
      SELECT id, COALESCE(nickname, name) AS name, phone,
             EXTRACT(MONTH FROM birth_date)::int AS month,
             EXTRACT(DAY FROM birth_date)::int AS date,
             EXTRACT(YEAR FROM birth_date)::int AS year
      FROM professionals
      WHERE account_id = ${accountId} AND active AND birth_date IS NOT NULL
    `,
  ]);
  const rows: { day: string; kind: "cliente" | "equipe"; id: string; name: string; phone: string | null; turning: number }[] = [];
  for (let step = 0; step < span; step++) {
    const day = shiftDay(fromDay, step);
    const month = Number(day.slice(5, 7));
    const date = Number(day.slice(8, 10));
    const year = Number(day.slice(0, 4));
    for (const person of clients) {
      if (person.month === month && person.date === date) {
        rows.push({ day, kind: "cliente", id: person.id, name: person.name, phone: person.phone, turning: year - person.year });
      }
    }
    for (const person of professionals) {
      if (person.month === month && person.date === date) {
        rows.push({ day, kind: "equipe", id: person.id, name: person.name, phone: person.phone, turning: year - person.year });
      }
    }
  }
  return rows;
}

export async function openPriceNotices(accountId: string) {
  return db()<{ id: string; serviceId: string | null; serviceName: string; beforeCents: number; afterCents: number }[]>`
    SELECT id, service_id AS "serviceId", service_name AS "serviceName",
           before_cents AS "beforeCents", after_cents AS "afterCents"
    FROM price_notices
    WHERE account_id = ${accountId} AND seen_at IS NULL
    ORDER BY changed_on, service_name
  `;
}

export async function houseModules(accountId: string) {
  const rows = await db()<{ modules: Partial<Record<HouseModuleId, boolean>> | null }[]>`
    SELECT modules FROM accounts WHERE id = ${accountId}
  `;
  const stored = rows[0]?.modules ?? {};
  const on = {} as Record<HouseModuleId, boolean>;
  for (const item of HOUSE_MODULES) on[item.id] = stored[item.id] !== false;
  return on;
}

export async function listCardAcquirers(accountId: string) {
  const machines = await db()<{ id: string; name: string; debitBps: number; creditBps: number; active: boolean }[]>`
    SELECT id, name, debit_bps AS "debitBps", credit_bps AS "creditBps", active
    FROM card_acquirers
    WHERE account_id = ${accountId}
    ORDER BY active DESC, name
  `;
  const brands = await db()<{
    id: string;
    acquirerId: string;
    name: string;
    debitBps: number;
    creditBps: number;
    active: boolean;
  }[]>`
    SELECT id, acquirer_id AS "acquirerId", name, debit_bps AS "debitBps", credit_bps AS "creditBps", active
    FROM card_brands
    WHERE account_id = ${accountId}
    ORDER BY name
  `;
  return machines.map((machine) => ({
    ...machine,
    brands: brands.filter((brand) => brand.acquirerId === machine.id),
  }));
}

export async function houseRules(accountId: string) {
  const rows = await db()<{
    referral: number;
    consumption: number;
    debit: number;
    credit: number;
    serviceDiscount: number;
    extrasLadder: boolean;
    cardFeeShare: number;
  }[]>`
    SELECT referral_commission_percent AS referral,
           staff_consumption_percent AS consumption,
           card_debit_percent AS debit,
           card_credit_percent AS credit,
           staff_service_discount_percent AS "serviceDiscount",
           extras_ladder AS "extrasLadder",
           card_fee_share_percent AS "cardFeeShare"
    FROM accounts
    WHERE id = ${accountId}
  `;
  return rows[0] ?? { referral: 0, consumption: 30, debit: 0, credit: 0, serviceDiscount: 0, extrasLadder: true, cardFeeShare: 50 };
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
  performers: string | null;
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
  to_char(price_changed_on, 'YYYY-MM-DD') AS "priceChangedOn",
  (
    SELECT string_agg(COALESCE(pr.nickname, pr.name), ', ' ORDER BY pr.name)
    FROM professional_services ps
    JOIN professionals pr ON pr.id = ps.professional_id
    WHERE ps.service_id = services.id
  ) AS performers
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

export async function listServiceLinks(serviceId: string) {
  return db()<{
    professionalId: string;
    priceCents: number | null;
    durationMin: number | null;
    commissionPercent: number | null;
  }[]>`
    SELECT professional_id AS "professionalId", price_cents AS "priceCents",
           duration_min AS "durationMin", commission_percent AS "commissionPercent"
    FROM professional_services
    WHERE service_id = ${serviceId}
  `;
}

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
  return db()<
    (Pick<ClientRow, "id" | "name" | "phone" | "channel" | "fromOutside" | "incomplete" | "active"> & {
      lastVisit: string | null;
    })[]
  >`
    SELECT id, name, phone, channel, from_outside AS "fromOutside", incomplete, active,
           (
             SELECT to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD')
             FROM appointments a
             WHERE a.client_id = clients.id
               AND a.account_id = clients.account_id
               AND a.status = 'realizado'
               AND a.kind = 'horario'
             ORDER BY a.starts_at DESC
             LIMIT 1
           ) AS "lastVisit"
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

export async function channelBook(accountId: string) {
  return db()<
    {
      id: string;
      name: string;
      phone: string;
      channel: string;
      fromOutside: boolean;
      incomplete: boolean;
      broughtBy: string | null;
    }[]
  >`
    SELECT c.id, c.name, c.phone, c.channel,
           c.from_outside AS "fromOutside", c.incomplete,
           COALESCE(p.nickname, p.name, r.name) AS "broughtBy"
    FROM clients c
    LEFT JOIN professionals p ON p.id = c.referrer_professional_id
    LEFT JOIN clients r ON r.id = c.referrer_client_id
    WHERE c.account_id = ${accountId}
      AND c.active
    ORDER BY c.name
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
  supplierName: string | null;
  staffPriceCents: number | null;
  balance: number;
};

export async function listProducts(accountId: string) {
  return db()<ProductRow[]>`
    SELECT p.id, p.name, p.brand, p.category, p.notes, p.barcode, p.active,
           p.sells_to_client AS "sellsToClient", p.is_supply AS "isSupply",
           p.sale_price_cents AS "salePriceCents", p.commission_percent AS "commissionPercent",
           p.cost_cents AS "costCents", p.min_qty AS "minQty",
           p.supplier_id AS "supplierId", s.name AS "supplierName", p.staff_price_cents AS "staffPriceCents",
           COALESCE((SELECT SUM(m.qty) FROM stock_movements m WHERE m.product_id = p.id), 0)::int AS balance
    FROM products p
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.account_id = ${accountId}
    ORDER BY p.category NULLS LAST, p.name
  `;
}

export async function getProduct(accountId: string, id: string) {
  const rows = await listProducts(accountId);
  return rows.find((row) => row.id === id) ?? null;
}

export async function productsAtMinimum(accountId: string) {
  const rows = await listProducts(accountId);
  return rows.filter((product) => product.active && product.minQty > 0 && product.balance <= product.minQty);
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

export async function listSupplierLabels(accountId: string) {
  return db()<{ supplierId: string; label: string; productId: string; productName: string }[]>`
    SELECT sl.supplier_id AS "supplierId", sl.label, sl.product_id AS "productId", p.name AS "productName"
    FROM supplier_labels sl
    JOIN products p ON p.id = sl.product_id
    WHERE sl.account_id = ${accountId}
    ORDER BY p.name, sl.label
  `;
}

export async function listPurchases(accountId: string, supplierId?: string) {
  const sql = db();
  return sql<{
    id: string;
    supplierId: string;
    supplierName: string;
    document: string;
    day: string;
    totalCents: number;
  }[]>`
    SELECT p.id, p.supplier_id AS "supplierId", s.name AS "supplierName", p.document,
           to_char(p.purchased_on, 'DD/MM/YYYY') AS day,
           COALESCE((SELECT SUM(l.qty * l.cost_cents) FROM purchase_lines l WHERE l.purchase_id = p.id), 0)::int AS "totalCents"
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.account_id = ${accountId}
      ${supplierId ? sql`AND p.supplier_id = ${supplierId}` : sql``}
    ORDER BY p.purchased_on DESC, p.created_at DESC
    LIMIT ${supplierId ? 40 : 30}
  `;
}

export async function getPurchase(accountId: string, id: string) {
  const rows = await db()<{ id: string; supplierName: string; document: string; day: string }[]>`
    SELECT p.id, s.name AS "supplierName", p.document, to_char(p.purchased_on, 'DD/MM/YYYY') AS day
    FROM purchases p
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.account_id = ${accountId} AND p.id = ${id}
  `;
  if (!rows[0]) return null;
  const [lines, bills] = await Promise.all([
    db()<{ productId: string; name: string; qty: number; costCents: number }[]>`
      SELECT l.product_id AS "productId", pr.name, l.qty, l.cost_cents AS "costCents"
      FROM purchase_lines l
      JOIN products pr ON pr.id = l.product_id
      WHERE l.purchase_id = ${id}
      ORDER BY pr.name
    `,
    db()<{ due: string; amountCents: number; paid: string | null }[]>`
      SELECT to_char(due_on, 'DD/MM/YYYY') AS due, amount_cents AS "amountCents",
             to_char(paid_on, 'DD/MM/YYYY') AS paid
      FROM payables
      WHERE account_id = ${accountId} AND purchase_id = ${id}
      ORDER BY installment_index
    `,
  ]);
  return { ...rows[0], lines, bills };
}

export type PayableRow = {
  id: string;
  description: string;
  partyName: string;
  amountCents: number;
  due: string;
  dueIso: string;
  installmentIndex: number;
  installmentTotal: number;
  method: string | null;
  cardBrand: string | null;
  paid: string | null;
  bankId: string | null;
  bankName: string | null;
  cardId: string | null;
  cardName: string | null;
  chartName: string | null;
  manual: boolean;
  recurrenceId: string | null;
  recurrenceActive: boolean;
};

export type ReceivableRow = {
  id: string;
  day: string;
  dayIso: string;
  clientName: string;
  phone: string | null;
  totalCents: number;
  paidCents: number;
};

export async function listReceivables(accountId: string) {
  return db()<ReceivableRow[]>`
    SELECT o.id,
           to_char(o.day, 'DD/MM/YYYY') AS day,
           to_char(o.day, 'YYYY-MM-DD') AS "dayIso",
           COALESCE(c.name, 'Sem nome') AS "clientName",
           c.phone,
           COALESCE(SUM(l.price_cents), 0)::int AS "totalCents",
           COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.order_id = o.id), 0)::int AS "paidCents"
    FROM orders o
    LEFT JOIN clients c ON c.id = o.client_id
    LEFT JOIN order_lines l ON l.order_id = o.id
    WHERE o.account_id = ${accountId} AND o.kind = 'cliente' AND o.status = 'aberta'
    GROUP BY o.id, o.day, c.name, c.phone
    HAVING COALESCE(SUM(l.price_cents), 0) >
           COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.order_id = o.id), 0)
    ORDER BY o.day, c.name
    LIMIT 80
  `;
}

export async function listPayables(accountId: string) {
  return db()<PayableRow[]>`
    SELECT id, description, party_name AS "partyName", amount_cents AS "amountCents",
           to_char(due_on, 'DD/MM/YYYY') AS due, to_char(due_on, 'YYYY-MM-DD') AS "dueIso",
           installment_index AS "installmentIndex", installment_total AS "installmentTotal",
           method, card_brand AS "cardBrand", to_char(paid_on, 'DD/MM/YYYY') AS paid,
           bank_account_id AS "bankId",
           (SELECT b.name FROM bank_accounts b WHERE b.id = payables.bank_account_id) AS "bankName",
           credit_card_id AS "cardId",
           (SELECT c.name FROM credit_cards c WHERE c.id = payables.credit_card_id) AS "cardName",
           (SELECT h.code || ' ' || h.name FROM chart_accounts h WHERE h.id = payables.chart_account_id) AS "chartName",
           purchase_id IS NULL AS manual,
           recurrence_id AS "recurrenceId",
           COALESCE((SELECT r.active FROM payable_recurrences r WHERE r.id = payables.recurrence_id), false) AS "recurrenceActive"
    FROM payables
    WHERE account_id = ${accountId}
    ORDER BY due_on, installment_index
    LIMIT 80
  `;
}

export type ComponentRow = { componentId: string; name: string; qty: number };

export async function productIsFree(productId: string) {
  const used = await db()`
    SELECT 1 FROM order_lines WHERE product_id = ${productId}
    UNION ALL
    SELECT 1 FROM purchase_lines WHERE product_id = ${productId}
    UNION ALL
    SELECT 1 FROM package_items WHERE product_id = ${productId}
    LIMIT 1
  `;
  return used.length === 0;
}

export async function listProductCommissions(productId: string) {
  return db()<{ professionalId: string; commissionPercent: number | null }[]>`
    SELECT professional_id AS "professionalId", commission_percent AS "commissionPercent"
    FROM professional_products
    WHERE product_id = ${productId}
  `;
}

export async function listComponents(productId: string) {
  return db()<ComponentRow[]>`
    SELECT c.component_id AS "componentId", p.name, c.qty
    FROM product_components c
    JOIN products p ON p.id = c.component_id
    WHERE c.product_id = ${productId}
    ORDER BY p.name
  `;
}

export type MovementRow = { qty: number; reason: string; note: string | null; at: string; who: string | null };

export async function listMovements(productId: string) {
  return db()<MovementRow[]>`
    SELECT m.qty, m.reason, m.note,
           to_char(m.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') AS at,
           u.name AS who
    FROM stock_movements m
    LEFT JOIN users u ON u.id = m.created_by
    WHERE m.product_id = ${productId}
    ORDER BY m.created_at DESC
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
           (
             SELECT string_agg(names.name, ', ' ORDER BY names.name)
             FROM (
               SELECT DISTINCT s.name
               FROM package_items i
               JOIN services s ON s.id = i.service_id
               WHERE i.package_id = p.id AND i.kind = 'service'
             ) names
           ) AS "serviceName"
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
