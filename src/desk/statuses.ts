export const APPOINTMENT_STATUS = {
  agendado: { word: "Agendado", bg: "#bfdbfe", fg: "#1e3a8a" },
  confirmado: { word: "Confirmado", bg: "#86efac", fg: "#14532d" },
  chegou: { word: "Chegou", bg: "#f9a8d4", fg: "#831843" },
  em_atendimento: { word: "Em atendimento", bg: "#fdba74", fg: "#7c2d12" },
  realizado: { word: "Realizado", bg: "#166534", fg: "#ffffff" },
  ausente: { word: "Ausente", bg: "#dc2626", fg: "#ffffff" },
  cancelado: { word: "Cancelado", bg: "#e5e7eb", fg: "#6b7280" },
  bloqueado: { word: "Bloqueado", bg: "#1d4ed8", fg: "#ffffff" },
} as const;

export const LUNCH = { word: "Almoço", bg: "#d1d5db", fg: "#1f2937" };
export const CLOSED = { word: "Fechado", bg: "#4b5563", fg: "#ffffff" };
export const FIT_IN = { word: "Encaixe", bg: "#6d28d9", fg: "#ffffff" };
export const OUTSIDE = { word: "De fora", bg: "#facc15", fg: "#422006" };

export const PAYMENT_METHODS = [
  { value: "dinheiro", label: "Dinheiro" },
  { value: "pix", label: "Pix" },
  { value: "debito", label: "Débito" },
  { value: "credito", label: "Crédito" },
  { value: "outros", label: "Outros" },
] as const;

const MOVED = new Set(["chegou", "em_atendimento", "realizado"]);

export function blockPaint(input: {
  status: string;
  encaixe: boolean;
  fromOutside: boolean;
  kind: string;
}) {
  if (input.kind === "bloqueio") return APPOINTMENT_STATUS.bloqueado;
  const moved = MOVED.has(input.status);
  if (!moved && input.fromOutside) return OUTSIDE;
  if (!moved && input.encaixe) return FIT_IN;
  return APPOINTMENT_STATUS[input.status as keyof typeof APPOINTMENT_STATUS] ?? APPOINTMENT_STATUS.agendado;
}
