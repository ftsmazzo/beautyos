import { birthdaysAhead, productsAtMinimum } from "@/catalog/queries";
import { db } from "@/db/client";
import { daysBetween, shiftDay, weekBounds } from "@/desk/clock";
import { overdueReturns } from "@/desk/queries";

export type ReportDay = { day: string; cents: number; orders: number };
export type ReportSlice = { id?: string; name: string; qty: number; cents: number };
export type ReportStatus = { status: string; qty: number };

export type ManagementReport = {
  revenueCents: number;
  previousCents: number;
  closedOrders: number;
  days: ReportDay[];
  methods: ReportSlice[];
  services: ReportSlice[];
  staff: ReportSlice[];
  products: ReportSlice[];
  statuses: ReportStatus[];
};

export function previousSpan(start: string, end: string) {
  const length = daysBetween(start, end);
  const previousEnd = shiftDay(start, -1);
  return { start: shiftDay(previousEnd, -length), end: previousEnd };
}

export function deltaPercent(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function managementReport(accountId: string, start: string, end: string): Promise<ManagementReport> {
  const previous = previousSpan(start, end);
  const [days, previousRows, closedRows, methods, services, staff, products, statuses] = await Promise.all([
    db()<ReportDay[]>`
      SELECT to_char(o.day, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(pay.amount_cents), 0)::int AS cents,
             COUNT(DISTINCT o.id)::int AS orders
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      WHERE pay.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND pay.method <> 'conta'
        AND o.day >= ${start}::date AND o.day <= ${end}::date
      GROUP BY o.day
      ORDER BY o.day
    `,
    db()<{ cents: number }[]>`
      SELECT COALESCE(SUM(pay.amount_cents), 0)::int AS cents
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      WHERE pay.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND pay.method <> 'conta'
        AND o.day >= ${previous.start}::date AND o.day <= ${previous.end}::date
    `,
    db()<{ qty: number }[]>`
      SELECT count(*)::int AS qty
      FROM orders
      WHERE account_id = ${accountId}
        AND kind = 'cliente'
        AND status = 'fechada'
        AND day >= ${start}::date AND day <= ${end}::date
    `,
    db()<ReportSlice[]>`
      SELECT pay.method AS name,
             count(*)::int AS qty,
             COALESCE(SUM(pay.amount_cents), 0)::int AS cents
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      WHERE pay.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND pay.method <> 'conta'
        AND o.day >= ${start}::date AND o.day <= ${end}::date
      GROUP BY pay.method
      ORDER BY cents DESC, pay.method
    `,
    db()<ReportSlice[]>`
      SELECT COALESCE(s.name, l.description) AS name,
             count(*)::int AS qty,
             COALESCE(SUM(l.price_cents), 0)::int AS cents
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      LEFT JOIN services s ON s.id = l.service_id
      WHERE o.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND l.kind = 'servico'
        AND NOT l.courtesy
        AND o.day >= ${start}::date AND o.day <= ${end}::date
      GROUP BY 1
      ORDER BY cents DESC, qty DESC, name
      LIMIT 8
    `,
    db()<{ id: string; name: string; qty: number; cents: number }[]>`
      SELECT p.id,
             COALESCE(NULLIF(p.nickname, ''), p.name) AS name,
             count(*)::int AS qty,
             COALESCE(SUM(l.price_cents), 0)::int AS cents
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      JOIN professionals p ON p.id = l.professional_id
      WHERE o.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND l.kind <> 'pacote'
        AND NOT l.courtesy
        AND o.day >= ${start}::date AND o.day <= ${end}::date
      GROUP BY p.id, p.nickname, p.name
      ORDER BY cents DESC, qty DESC, name
      LIMIT 8
    `,
    db()<ReportSlice[]>`
      SELECT COALESCE(pr.name, l.description) AS name,
             COALESCE(SUM(l.qty), 0)::int AS qty,
             COALESCE(SUM(l.price_cents), 0)::int AS cents
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      LEFT JOIN products pr ON pr.id = l.product_id
      WHERE o.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND l.kind = 'produto'
        AND NOT l.courtesy
        AND o.day >= ${start}::date AND o.day <= ${end}::date
      GROUP BY 1
      ORDER BY cents DESC, qty DESC, name
      LIMIT 8
    `,
    db()<ReportStatus[]>`
      SELECT a.status, count(*)::int AS qty
      FROM appointments a
      WHERE a.account_id = ${accountId}
        AND a.kind = 'horario'
        AND a.status <> 'bloqueado'
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${start}::date
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${end}::date
      GROUP BY a.status
    `,
  ]);

  return {
    revenueCents: days.reduce((sum, row) => sum + row.cents, 0),
    previousCents: previousRows[0]?.cents ?? 0,
    closedOrders: closedRows[0]?.qty ?? 0,
    days,
    methods,
    services,
    staff,
    products,
    statuses,
  };
}

export type AgendaPerson = {
  id: string;
  name: string;
  qty: number;
  done: number;
  absent: number;
  cancelled: number;
};

export async function agendaReport(accountId: string, start: string, end: string) {
  const [people, hours] = await Promise.all([
    db()<AgendaPerson[]>`
      SELECT p.id,
             COALESCE(NULLIF(p.nickname, ''), p.name) AS name,
             count(*)::int AS qty,
             count(*) FILTER (WHERE a.status = 'realizado')::int AS done,
             count(*) FILTER (WHERE a.status = 'ausente')::int AS absent,
             count(*) FILTER (WHERE a.status = 'cancelado')::int AS cancelled
      FROM appointments a
      JOIN professionals p ON p.id = a.professional_id
      WHERE a.account_id = ${accountId}
        AND a.kind = 'horario'
        AND a.status <> 'bloqueado'
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${start}::date
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${end}::date
      GROUP BY p.id, p.nickname, p.name
      ORDER BY count(*) FILTER (WHERE a.status = 'ausente') DESC, count(*) DESC, name
    `,
    db()<{ hour: number; qty: number }[]>`
      SELECT EXTRACT(HOUR FROM a.starts_at AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
             count(*)::int AS qty
      FROM appointments a
      WHERE a.account_id = ${accountId}
        AND a.kind = 'horario'
        AND a.status NOT IN ('bloqueado', 'cancelado')
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${start}::date
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${end}::date
      GROUP BY 1
      ORDER BY 1
    `,
  ]);
  return { people, hours };
}

export type OrderPerson = { id: string; name: string; orders: number; open: number; items: number; cents: number };
export type OrderState = { status: string; qty: number; cents: number; items: number };
export type OpenGap = { id: string; who: string; day: string; gapCents: number };

export async function ordersReport(accountId: string, start: string, end: string) {
  const [states, people, gaps] = await Promise.all([
    db()<OrderState[]>`
      SELECT o.status,
             count(*)::int AS qty,
             COALESCE(SUM((SELECT COALESCE(SUM(l.price_cents), 0) FROM order_lines l WHERE l.order_id = o.id)), 0)::int AS cents,
             COALESCE(SUM((SELECT count(*) FROM order_lines l WHERE l.order_id = o.id)), 0)::int AS items
      FROM orders o
      WHERE o.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND o.day >= ${start}::date AND o.day <= ${end}::date
      GROUP BY o.status
    `,
    db()<OrderPerson[]>`
      SELECT p.id,
             COALESCE(NULLIF(p.nickname, ''), p.name) AS name,
             COUNT(DISTINCT o.id)::int AS orders,
             COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'aberta')::int AS open,
             COUNT(l.id)::int AS items,
             COALESCE(SUM(l.price_cents), 0)::int AS cents
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      JOIN professionals p ON p.id = l.professional_id
      WHERE o.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND o.day >= ${start}::date AND o.day <= ${end}::date
      GROUP BY p.id, p.nickname, p.name
      ORDER BY cents DESC, orders DESC, name
    `,
    db()<OpenGap[]>`
      SELECT o.id::text AS id,
             COALESCE(c.name, 'Sem nome') AS who,
             to_char(o.day, 'YYYY-MM-DD') AS day,
             (
               COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)
               - COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)
             )::int AS "gapCents"
      FROM orders o
      LEFT JOIN clients c ON c.id = o.client_id
      WHERE o.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND o.status = 'aberta'
        AND o.day >= ${start}::date AND o.day <= ${end}::date
        AND (
          COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)
          - COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)
        ) > 0
      ORDER BY "gapCents" DESC
    `,
  ]);
  return { states, people, gaps };
}

export type StockRow = {
  id: string;
  name: string;
  balance: number;
  minQty: number;
  costCents: number;
  saleCents: number;
  soldQty: number;
  soldCents: number;
  sells: boolean;
  supply: boolean;
};

export async function stockReport(accountId: string, start: string, end: string) {
  return db()<StockRow[]>`
    SELECT p.id, p.name,
           COALESCE((SELECT SUM(m.qty) FROM stock_movements m WHERE m.product_id = p.id), 0)::int AS balance,
           p.min_qty AS "minQty",
           p.cost_cents AS "costCents",
           p.sale_price_cents AS "saleCents",
           COALESCE(sold.qty, 0)::int AS "soldQty",
           COALESCE(sold.cents, 0)::int AS "soldCents",
           p.sells_to_client AS sells,
           p.is_supply AS supply
    FROM products p
    LEFT JOIN LATERAL (
      SELECT SUM(l.qty)::int AS qty, SUM(l.price_cents)::int AS cents
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      WHERE l.product_id = p.id
        AND o.kind = 'cliente'
        AND NOT l.courtesy
        AND o.day >= ${start}::date AND o.day <= ${end}::date
    ) sold ON true
    WHERE p.account_id = ${accountId}
      AND p.active
    ORDER BY (p.min_qty > 0 AND COALESCE((SELECT SUM(m.qty) FROM stock_movements m WHERE m.product_id = p.id), 0) <= p.min_qty) DESC,
             COALESCE(sold.cents, 0) DESC,
             p.name
  `;
}

export type PurchaseReportRow = {
  id: string;
  supplierName: string;
  document: string;
  day: string;
  lines: number;
  totalCents: number;
};

export type PurchaseSupplierSlice = { name: string; qty: number; cents: number };

export async function purchasesReport(accountId: string, start: string, end: string) {
  const [rows, suppliers] = await Promise.all([
    db()<PurchaseReportRow[]>`
      SELECT p.id, s.name AS "supplierName", p.document,
             to_char(p.purchased_on, 'DD/MM/YYYY') AS day,
             (SELECT COUNT(*) FROM purchase_lines l WHERE l.purchase_id = p.id)::int AS lines,
             COALESCE((SELECT SUM(l.qty * l.cost_cents) FROM purchase_lines l WHERE l.purchase_id = p.id), 0)::int AS "totalCents"
      FROM purchases p
      JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.account_id = ${accountId}
        AND p.purchased_on >= ${start}::date
        AND p.purchased_on <= ${end}::date
      ORDER BY p.purchased_on DESC, p.created_at DESC
      LIMIT 200
    `,
    db()<PurchaseSupplierSlice[]>`
      SELECT s.name,
             COUNT(p.id)::int AS qty,
             COALESCE(SUM(line.total), 0)::int AS cents
      FROM purchases p
      JOIN suppliers s ON s.id = p.supplier_id
      LEFT JOIN LATERAL (
        SELECT SUM(l.qty * l.cost_cents)::int AS total
        FROM purchase_lines l
        WHERE l.purchase_id = p.id
      ) line ON true
      WHERE p.account_id = ${accountId}
        AND p.purchased_on >= ${start}::date
        AND p.purchased_on <= ${end}::date
      GROUP BY s.id, s.name
      ORDER BY cents DESC, s.name
    `,
  ]);
  return { rows, suppliers };
}

export const CALL_AFTER = 30;
export const LOST_AFTER = 120;
export const RETURN_GAP = 60;

export type SilentClient = {
  id: string;
  name: string;
  phone: string;
  lastDay: string;
  days: number;
  service: string | null;
};

export type ReturnedClient = {
  id: string;
  name: string;
  phone: string;
  day: string;
  gap: number;
  service: string | null;
};

export async function clientSilence(accountId: string, today: string) {
  return db()<SilentClient[]>`
    SELECT c.id, c.name, c.phone,
           to_char(last.day, 'YYYY-MM-DD') AS "lastDay",
           (${today}::date - last.day)::int AS days,
           last.service
    FROM clients c
    JOIN LATERAL (
      SELECT (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
             s.name AS service
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.client_id = c.id
        AND a.account_id = c.account_id
        AND a.kind = 'horario'
        AND a.status = 'realizado'
      ORDER BY a.starts_at DESC
      LIMIT 1
    ) last ON true
    WHERE c.account_id = ${accountId}
      AND c.active
      AND NOT c.from_outside
      AND (${today}::date - last.day) >= ${CALL_AFTER}
      AND NOT EXISTS (
        SELECT 1 FROM appointments n
        WHERE n.client_id = c.id
          AND n.account_id = c.account_id
          AND n.kind = 'horario'
          AND n.status IN ('agendado', 'confirmado', 'chegou', 'em_atendimento')
          AND (n.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${today}::date
      )
    ORDER BY days DESC, c.name
  `;
}

export async function clientsReturned(accountId: string, start: string, end: string) {
  return db()<ReturnedClient[]>`
    SELECT c.id, c.name, c.phone,
           to_char(visit.day, 'YYYY-MM-DD') AS day,
           (visit.day - prev.day)::int AS gap,
           visit.service
    FROM clients c
    JOIN LATERAL (
      SELECT (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
             s.name AS service
      FROM appointments a
      LEFT JOIN services s ON s.id = a.service_id
      WHERE a.client_id = c.id
        AND a.account_id = c.account_id
        AND a.kind = 'horario'
        AND a.status = 'realizado'
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${start}::date
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${end}::date
      ORDER BY a.starts_at DESC
      LIMIT 1
    ) visit ON true
    JOIN LATERAL (
      SELECT (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date AS day
      FROM appointments a
      WHERE a.client_id = c.id
        AND a.account_id = c.account_id
        AND a.kind = 'horario'
        AND a.status = 'realizado'
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date < visit.day
      ORDER BY a.starts_at DESC
      LIMIT 1
    ) prev ON true
    WHERE c.account_id = ${accountId}
      AND c.active
      AND (visit.day - prev.day) >= ${RETURN_GAP}
    ORDER BY gap DESC, c.name
  `;
}

export type ExtraPerson = {
  id: string;
  name: string;
  qty: number;
  cents: number;
  clients: number;
  items: number;
};

export type ExtraService = { id: string; name: string; qty: number; cents: number };

export async function extrasReport(accountId: string, start: string, end: string) {
  const [people, services, marked] = await Promise.all([
    db()<ExtraPerson[]>`
      SELECT pr.id,
             COALESCE(NULLIF(pr.nickname, ''), pr.name) AS name,
             COALESCE(extra.qty, 0)::int AS qty,
             COALESCE(extra.cents, 0)::int AS cents,
             COALESCE(work.clients, 0)::int AS clients,
             COALESCE(work.items, 0)::int AS items
      FROM professionals pr
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS qty,
               COALESCE(SUM(l.price_cents), 0)::int AS cents
        FROM order_lines l
        JOIN orders o ON o.id = l.order_id
        JOIN services s ON s.id = l.service_id
        WHERE l.professional_id = pr.id
          AND o.account_id = pr.account_id
          AND o.kind = 'cliente'
          AND o.day >= ${start}::date AND o.day <= ${end}::date
          AND l.kind = 'servico'
          AND s.extras_goal
          AND NOT l.courtesy
          AND NOT EXISTS (
            SELECT 1 FROM appointments a
            WHERE a.id = l.appointment_id AND a.status = 'cancelado'
          )
      ) extra ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT o.client_id)::int AS clients,
               count(*)::int AS items
        FROM order_lines l
        JOIN orders o ON o.id = l.order_id
        WHERE l.professional_id = pr.id
          AND o.account_id = pr.account_id
          AND o.kind = 'cliente'
          AND o.day >= ${start}::date AND o.day <= ${end}::date
          AND l.kind = 'servico'
          AND NOT l.courtesy
          AND o.client_id IS NOT NULL
      ) work ON true
      WHERE pr.account_id = ${accountId}
        AND pr.active
        AND (COALESCE(work.items, 0) > 0 OR COALESCE(extra.qty, 0) > 0)
      ORDER BY cents DESC, qty DESC, name
    `,
    db()<ExtraService[]>`
      SELECT s.id, s.name,
             count(*)::int AS qty,
             COALESCE(SUM(l.price_cents), 0)::int AS cents
      FROM order_lines l
      JOIN orders o ON o.id = l.order_id
      JOIN services s ON s.id = l.service_id
      WHERE o.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND o.day >= ${start}::date AND o.day <= ${end}::date
        AND l.kind = 'servico'
        AND s.extras_goal
        AND NOT l.courtesy
      GROUP BY s.id, s.name
      ORDER BY cents DESC, qty DESC, s.name
    `,
    db()<{ qty: number }[]>`
      SELECT count(*)::int AS qty
      FROM services
      WHERE account_id = ${accountId}
        AND active
        AND extras_goal
    `,
  ]);
  return { people, services, marked: marked[0]?.qty ?? 0 };
}

export type FinanceMethod = { name: string; qty: number; cents: number; fees: number };
export type FinanceDay = { day: string; cents: number; fees: number };

export async function financeReport(accountId: string, start: string, end: string) {
  const previous = previousSpan(start, end);
  const span = async (from: string, to: string) => {
    const rows = await db()<{ cents: number; fees: number }[]>`
      SELECT COALESCE(SUM(pay.amount_cents), 0)::int AS cents,
             COALESCE(SUM(pay.fee_cents), 0)::int AS fees
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      WHERE pay.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND pay.method <> 'conta'
        AND o.day >= ${from}::date AND o.day <= ${to}::date
    `;
    return rows[0] ?? { cents: 0, fees: 0 };
  };
  const [current, before, methods, days] = await Promise.all([
    span(start, end),
    span(previous.start, previous.end),
    db()<FinanceMethod[]>`
      SELECT pay.method AS name,
             count(*)::int AS qty,
             COALESCE(SUM(pay.amount_cents), 0)::int AS cents,
             COALESCE(SUM(pay.fee_cents), 0)::int AS fees
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      WHERE pay.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND pay.method <> 'conta'
        AND o.day >= ${start}::date AND o.day <= ${end}::date
      GROUP BY pay.method
      ORDER BY cents DESC, pay.method
    `,
    db()<FinanceDay[]>`
      SELECT to_char(o.day, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(pay.amount_cents), 0)::int AS cents,
             COALESCE(SUM(pay.fee_cents), 0)::int AS fees
      FROM payments pay
      JOIN orders o ON o.id = pay.order_id
      WHERE pay.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND pay.method <> 'conta'
        AND o.day >= ${start}::date AND o.day <= ${end}::date
      GROUP BY o.day
      ORDER BY o.day
    `,
  ]);
  return {
    cents: current.cents,
    fees: current.fees,
    previousCents: before.cents,
    previousFees: before.fees,
    methods,
    days,
  };
}

export type ActionRow = { id: string; label: string; count: number; href: string };

export async function actionQueue(accountId: string, today: string, admin = false) {
  const week = weekBounds(today);
  const weekEnd = today < week.end ? today : week.end;
  const from = shiftDay(today, -91);
  const [stock, silent, gaps, absent, late, birthdays, bills] = await Promise.all([
    productsAtMinimum(accountId),
    clientSilence(accountId, today),
    db()<{ qty: number }[]>`
      SELECT count(*)::int AS qty
      FROM orders o
      WHERE o.account_id = ${accountId}
        AND o.kind = 'cliente'
        AND o.status = 'aberta'
        AND o.day >= ${from}::date AND o.day <= ${today}::date
        AND (
          COALESCE((SELECT SUM(l.price_cents) FROM order_lines l WHERE l.order_id = o.id), 0)
          - COALESCE((SELECT SUM(pay.amount_cents) FROM payments pay WHERE pay.order_id = o.id), 0)
        ) > 0
    `,
    db()<{ qty: number }[]>`
      SELECT count(*)::int AS qty
      FROM appointments a
      WHERE a.account_id = ${accountId}
        AND a.kind = 'horario'
        AND a.status = 'ausente'
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= ${week.start}::date
        AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date <= ${weekEnd}::date
    `,
    overdueReturns(accountId, today),
    birthdaysAhead(accountId, today, 7),
    admin
      ? db()<{ qty: number }[]>`
          SELECT count(*)::int AS qty
          FROM payables
          WHERE account_id = ${accountId}
            AND paid_on IS NULL
            AND due_on < ${today}::date
        `
      : Promise.resolve([{ qty: 0 }]),
  ]);
  const rows: ActionRow[] = [
    { id: "estoque", label: "Estoque no mínimo", count: stock.length, href: "/produtos/compra?pedir=1" },
    {
      id: "receber",
      label: "Falta receber",
      count: gaps[0]?.qty ?? 0,
      href: "/financeiro/receber",
    },
    ...(admin
      ? [
          {
            id: "pagar",
            label: "Contas atrasadas",
            count: bills[0]?.qty ?? 0,
            href: "/financeiro?filtro=atrasado",
          } satisfies ActionRow,
        ]
      : []),
    { id: "faltas", label: "Faltas na semana", count: absent[0]?.qty ?? 0, href: `/relatorios/agenda?de=${week.start}&ate=${weekEnd}` },
    { id: "chamar", label: "Chamar", count: silent.filter((row) => row.days < LOST_AFTER).length, href: `/relatorios/clientes?de=${from}&ate=${today}` },
    { id: "sumidos", label: "Sumidos", count: silent.filter((row) => row.days >= LOST_AFTER).length, href: `/relatorios/clientes?de=${from}&ate=${today}&lista=sumidos` },
    { id: "volta", label: "Passou da volta", count: late.length, href: "/volta?filtro=passou" },
    { id: "niver", label: "Aniversários em 7 dias", count: birthdays.length, href: "/aniversariantes" },
  ];
  return rows.filter((row) => row.count > 0);
}
