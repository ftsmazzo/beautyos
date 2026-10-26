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
