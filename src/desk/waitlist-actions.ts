"use server";

import { cancelWaitlistEntry, enterWaitlist, markWaitlistAvisada } from "@/agent/waitlist";
import { requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { settle } from "@/catalog/settle";
import { dayParam } from "@/desk/clock";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function deskEnterWaitlist(formData: FormData) {
  const user = await requireOperator();
  const day = dayParam(String(formData.get("day") ?? ""));
  return settle(`/espera?dia=${day}`, async () => {
    const clientId = String(formData.get("client") ?? "");
    const serviceId = String(formData.get("service") ?? "");
    const professionalId = String(formData.get("professional") ?? "").trim() || null;
    const note = String(formData.get("note") ?? "").trim() || null;
    if (!UUID.test(clientId) || !UUID.test(serviceId)) throw new FormError("dados");
    await enterWaitlist({
      accountId: user.accountId,
      clientId,
      serviceId,
      professionalId,
      day,
      note,
    });
    return `/espera?dia=${day}&ok=espera`;
  });
}

export async function deskMarkWaitlistAvisada(formData: FormData) {
  const user = await requireOperator();
  const id = String(formData.get("id") ?? "");
  const day = dayParam(String(formData.get("day") ?? ""));
  return settle(`/espera?dia=${day}`, async () => {
    await markWaitlistAvisada(user.accountId, id);
    return `/espera?dia=${day}&ok=aviso`;
  });
}

export async function deskCancelWaitlist(formData: FormData) {
  const user = await requireOperator();
  const id = String(formData.get("id") ?? "");
  const day = dayParam(String(formData.get("day") ?? ""));
  return settle(`/espera?dia=${day}`, async () => {
    await cancelWaitlistEntry(user.accountId, id);
    return `/espera?dia=${day}&ok=saiu`;
  });
}
