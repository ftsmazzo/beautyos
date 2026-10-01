import { FormError } from "@/catalog/errors";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type HourSlot = {
  weekday: number;
  period: number;
  start: string;
  end: string;
};

export function readHours(formData: FormData, prefix: string): HourSlot[] {
  const slots: HourSlot[] = [];
  for (let weekday = 0; weekday <= 6; weekday++) {
    const day: { start: string; end: string }[] = [];
    for (const period of [1, 2]) {
      const start = String(formData.get(`${prefix}_${weekday}_${period}_start`) ?? "").trim();
      const end = String(formData.get(`${prefix}_${weekday}_${period}_end`) ?? "").trim();
      if (!start && !end) continue;
      if (!TIME.test(start) || !TIME.test(end) || end <= start) throw new FormError("horario");
      day.push({ start, end });
    }
    day.sort((a, b) => a.start.localeCompare(b.start));
    if (day.length === 2 && day[0].end > day[1].start) throw new FormError("horario");
    day.forEach((slot, index) => {
      slots.push({ weekday, period: index + 1, start: slot.start, end: slot.end });
    });
  }
  return slots;
}
