"use server";

import { requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { settle } from "@/catalog/settle";
import { dayParam } from "@/desk/clock";
import { setReminderStatus } from "@/desk/reminders";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function markReminderDone(formData: FormData) {
  const user = await requireOperator();
  const id = String(formData.get("id") ?? "");
  const day = dayParam(String(formData.get("day") ?? ""));
  return settle(`/lembretes?dia=${day}`, async () => {
    if (!UUID.test(id)) throw new FormError("dados");
    await setReminderStatus(user.accountId, id, "feito");
    return `/lembretes?dia=${day}&ok=feito`;
  });
}

export async function cancelReminder(formData: FormData) {
  const user = await requireOperator();
  const id = String(formData.get("id") ?? "");
  const day = dayParam(String(formData.get("day") ?? ""));
  return settle(`/lembretes?dia=${day}`, async () => {
    if (!UUID.test(id)) throw new FormError("dados");
    await setReminderStatus(user.accountId, id, "cancelado");
    return `/lembretes?dia=${day}&ok=cancela`;
  });
}
