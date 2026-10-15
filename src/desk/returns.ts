import { daysBetween, shiftDay } from "@/desk/clock";

export const RETURN_OUTCOMES = ["passou", "nao_veio", "avulso", "renovou", "voltou", "fora"] as const;

export type ReturnOutcome = (typeof RETURN_OUTCOMES)[number];

export const RETURN_WORD: Record<ReturnOutcome, string> = {
  passou: "passou e não voltou",
  nao_veio: "não renovou e não veio",
  avulso: "não renovou e veio avulso",
  renovou: "renovou o pacote",
  voltou: "voltou no prazo",
  fora: "de fora",
};

export type ReturnFacts = {
  fromOutside: boolean;
  day: string;
  prevDay: string | null;
  returnDays: number | null;
  avulso: boolean;
  future: boolean;
  activePackage: boolean;
  renewed: boolean;
  packageEndedOn: string | null;
};

export function classifyReturn(facts: ReturnFacts, today: string): ReturnOutcome | null {
  if (facts.fromOutside) return "fora";
  if (facts.renewed) return "renovou";
  if (facts.activePackage) return null;
  if (facts.packageEndedOn) {
    const cameAfter = facts.avulso && facts.day > facts.packageEndedOn;
    if (cameAfter) {
      if (facts.returnDays == null || facts.future) return "avulso";
      const due = shiftDay(facts.day, facts.returnDays);
      return today <= due ? "avulso" : "passou";
    }
    if (today > facts.packageEndedOn && !facts.future && facts.day <= facts.packageEndedOn) return "nao_veio";
    return null;
  }
  if (facts.returnDays == null) return null;
  const due = shiftDay(facts.day, facts.returnDays);
  if (facts.prevDay) {
    const gap = daysBetween(facts.prevDay, facts.day);
    if (gap >= 0 && gap <= facts.returnDays && today <= due) return "voltou";
  }
  if (today > due && !facts.future) return "passou";
  return null;
}
