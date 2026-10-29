import type { ReactNode } from "react";
import Link from "next/link";
import { formatDay, todaySaoPaulo } from "@/catalog/format";
import { monthBounds, shiftDay, weekBounds } from "@/desk/clock";

function href(path: string, start: string, end: string, extra?: Record<string, string>) {
  const params = new URLSearchParams({ de: start, ate: end });
  for (const [key, value] of Object.entries(extra ?? {})) {
    if (value) params.set(key, value);
  }
  return `${path}?${params}`;
}

export function ReportPeriod({
  path,
  start,
  end,
  tooLong,
  span,
  extra,
  children,
}: {
  path: string;
  start: string;
  end: string;
  tooLong?: boolean;
  span?: number;
  extra?: Record<string, string>;
  children?: ReactNode;
}) {
  const today = todaySaoPaulo();
  const week = weekBounds(today);
  const month = monthBounds(today);
  return (
    <form className="desk-bar" action={path}>
      {Object.entries(extra ?? {}).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}
      <Link className="btn btn-outline" href={href(path, today, today, extra)}>Hoje</Link>
      <Link className="btn btn-outline" href={href(path, shiftDay(today, -6), today, extra)}>7 dias</Link>
      <Link className="btn btn-outline" href={href(path, week.start, today < week.end ? today : week.end, extra)}>Semana</Link>
      <Link className="btn btn-outline" href={href(path, month.start, today, extra)}>Mês</Link>
      <label>
        De
        <input name="de" type="date" defaultValue={start} required />
      </label>
      <label>
        Até
        <input name="ate" type="date" defaultValue={end} required />
      </label>
      <button className="btn btn-primary" type="submit">Ver</button>
      <span className="badge bg-secondary-lt">{tooLong && span ? `máx. ${span} dias` : `${formatDay(start)} – ${formatDay(end)}`}</span>
      {children}
    </form>
  );
}
