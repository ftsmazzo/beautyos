import { todaySaoPaulo } from "@/catalog/format";

export function dayParam(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return todaySaoPaulo();
}

export function shiftDay(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00-03:00`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(day: string) {
  return new Date(`${day}T12:00:00-03:00`).getUTCDay();
}

export function minutes(time: string) {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

export function fromMinutes(total: number) {
  const hour = Math.floor(total / 60);
  const minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function addMinutes(time: string, amount: number) {
  return fromMinutes(minutes(time) + amount);
}

export function stamp(day: string, time: string) {
  return `${day}T${time.slice(0, 5)}:00-03:00`;
}

export type Period = { start: string; end: string };

export function periodsFor(rows: { weekday: number; period: number; startTime: string; endTime: string; validFrom: string | null; validUntil: string | null }[], day: string): Period[] {
  const weekday = weekdayOf(day);
  const override = rows.filter((row) => row.validFrom && row.validUntil && row.validFrom <= day && row.validUntil >= day && row.weekday === weekday);
  const source = (override.length ? override : rows.filter((row) => !row.validFrom && row.weekday === weekday))
    .slice()
    .sort((a, b) => a.period - b.period || a.startTime.localeCompare(b.startTime));
  return source.map((row) => ({ start: row.startTime.slice(0, 5), end: row.endTime.slice(0, 5) }));
}

export function placementIssue(periods: Period[], start: string, end: string) {
  if (!periods.length) return "fechado" as const;
  const open = minutes(start);
  const close = minutes(end);
  if (periods.some((period) => minutes(period.start) <= open && close <= minutes(period.end))) return null;
  if (periods.length >= 2) {
    const gapStart = minutes(periods[0].end);
    const gapEnd = minutes(periods[1].start);
    if (open < gapEnd && close > gapStart) return "almoco" as const;
  }
  return "fechado" as const;
}
