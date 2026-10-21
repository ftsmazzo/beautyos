export function parseReais(value: string): number | null {
  const trimmed = value.trim().replace(/\s/g, "").replace("R$", "");
  if (!trimmed) return null;
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export function formatReais(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function centsToInput(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatRate(bps: number) {
  return `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export function parseRateBps(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim().replace("%", "").replace(",", ".");
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100) return null;
  return Math.round(amount * 100);
}

export function parsePercent(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim().replace("%", "").replace(",", ".");
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100) return null;
  return Math.round(amount);
}

export function parseIntField(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const amount = Number(raw);
  if (!Number.isInteger(amount)) return null;
  return amount;
}

export function textOrNull(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  return raw ? raw : null;
}

export function checked(formData: FormData, name: string) {
  const value = formData.get(name);
  return value === "on" || value === "1";
}

export function digits(value: string) {
  return value.replace(/\D/g, "");
}

export function formatPhone(value: string) {
  const phone = digits(value);
  if (phone.length === 11) return `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`;
  if (phone.length === 10) return `(${phone.slice(0, 2)}) ${phone.slice(2, 6)}-${phone.slice(6)}`;
  return value;
}

export function todaySaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function packageDeadline(item: {
  started: boolean;
  validUntil: string | null;
  expired: boolean;
  late: boolean;
}) {
  if (!item.started || !item.validUntil) return "prazo ainda não começou";
  if (item.expired || item.late) return `vencido em ${item.validUntil}`;
  return `válido até ${item.validUntil}`;
}

export function formatDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export function daysAbsent(lastDay: string | null, today: string) {
  if (!lastDay) return "sem visita";
  const start = new Date(`${lastDay.slice(0, 10)}T12:00:00-03:00`).getTime();
  const end = new Date(`${today.slice(0, 10)}T12:00:00-03:00`).getTime();
  const days = Math.round((end - start) / 86_400_000);
  if (days === 0) return "hoje";
  if (days < 0) return formatDay(lastDay);
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

export function staffPriceCents(saleCents: number, customCents: number | null, housePercent: number) {
  if (customCents != null) return customCents;
  return Math.round((saleCents * housePercent) / 100);
}

export function packageGap(avulsoCents: number, internalCents: number) {
  const gap = avulsoCents - internalCents;
  if (gap === 0) return "igual ao avulso";
  if (gap > 0) return `${formatReais(gap)} abaixo do avulso`;
  return `${formatReais(Math.abs(gap))} acima do avulso`;
}
