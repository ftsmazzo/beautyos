import { db } from "@/db/client";
import { daysBetween, shiftDay } from "@/desk/clock";

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
