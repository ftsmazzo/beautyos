import { randomUUID } from "crypto";
import { FormError } from "@/catalog/errors";
import { todaySaoPaulo } from "@/catalog/format";
import { dayParam } from "@/desk/clock";
import { db } from "@/db/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function expirePastWaitlist(accountId: string) {
  const today = todaySaoPaulo();
  await db()`
    UPDATE waitlist
    SET status = 'expirada'
    WHERE account_id = ${accountId}
      AND status = 'aberta'
      AND day < ${today}::date
  `;
}

export async function enterWaitlist(input: {
  accountId: string;
  clientId: string;
  serviceId: string;
  professionalId?: string | null;
  day: string;
  note?: string | null;
}) {
  if (!UUID.test(input.clientId) || !UUID.test(input.serviceId)) throw new FormError("dados");
  const day = dayParam(input.day);
  const pro = input.professionalId && UUID.test(input.professionalId) ? input.professionalId : null;
  const client = await db()`SELECT id FROM clients WHERE id = ${input.clientId} AND account_id = ${input.accountId} AND active`;
  if (!client.length) throw new FormError("cliente");
  const service = await db()`
    SELECT id FROM services WHERE id = ${input.serviceId} AND account_id = ${input.accountId} AND active AND bookable
  `;
  if (!service.length) throw new FormError("dados");
  if (pro) {
    const person = await db()`
      SELECT id FROM professionals WHERE id = ${pro} AND account_id = ${input.accountId} AND active
    `;
    if (!person.length) throw new FormError("dados");
  }
  const existing = await db()<{ id: string }[]>`
    SELECT id FROM waitlist
    WHERE account_id = ${input.accountId}
      AND client_id = ${input.clientId}
      AND service_id = ${input.serviceId}
      AND day = ${day}::date
      AND status = 'aberta'
      AND (${pro}::uuid IS NULL OR professional_id IS NOT DISTINCT FROM ${pro})
    LIMIT 1
  `;
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
  await db()`
    INSERT INTO waitlist (id, account_id, client_id, service_id, professional_id, day, note, status)
    VALUES (${id}, ${input.accountId}, ${input.clientId}, ${input.serviceId}, ${pro}, ${day}::date, ${input.note ?? null}, 'aberta')
  `;
  return id;
}

export async function leaveWaitlist(accountId: string, clientId: string, waitlistId?: string | null) {
  if (waitlistId && UUID.test(waitlistId)) {
    await db()`
      UPDATE waitlist SET status = 'cancelada'
      WHERE id = ${waitlistId} AND account_id = ${accountId} AND client_id = ${clientId} AND status = 'aberta'
    `;
    return;
  }
  await db()`
    UPDATE waitlist SET status = 'cancelada'
    WHERE account_id = ${accountId} AND client_id = ${clientId} AND status = 'aberta'
  `;
}

export async function listClientWaitlist(accountId: string, clientId: string) {
  return db()<
    {
      id: string;
      day: string;
      serviceName: string;
      professionalName: string | null;
      status: string;
      note: string | null;
    }[]
  >`
    SELECT w.id, to_char(w.day, 'YYYY-MM-DD') AS day,
           s.name AS "serviceName",
           COALESCE(NULLIF(p.nickname, ''), p.name) AS "professionalName",
           w.status, w.note
    FROM waitlist w
    JOIN services s ON s.id = w.service_id
    LEFT JOIN professionals p ON p.id = w.professional_id
    WHERE w.account_id = ${accountId}
      AND w.client_id = ${clientId}
      AND w.status IN ('aberta', 'avisada')
    ORDER BY w.day, w.created_at
  `;
}

export async function listOpenWaitlist(accountId: string) {
  await expirePastWaitlist(accountId);
  return db()<
    {
      id: string;
      day: string;
      clientName: string;
      phone: string;
      serviceName: string;
      professionalName: string | null;
      note: string | null;
      status: string;
    }[]
  >`
    SELECT w.id, to_char(w.day, 'YYYY-MM-DD') AS day,
           c.name AS "clientName", c.phone,
           s.name AS "serviceName",
           COALESCE(NULLIF(p.nickname, ''), p.name) AS "professionalName",
           w.note, w.status
    FROM waitlist w
    JOIN clients c ON c.id = w.client_id
    JOIN services s ON s.id = w.service_id
    LEFT JOIN professionals p ON p.id = w.professional_id
    WHERE w.account_id = ${accountId} AND w.status = 'aberta'
    ORDER BY w.day, w.created_at
    LIMIT 80
  `;
}
