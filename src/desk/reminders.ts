import { randomUUID } from "crypto";
import { formatDay, formatPhone, todaySaoPaulo } from "@/catalog/format";
import { birthdaysAhead } from "@/catalog/queries";
import { dayParam, shiftDay } from "@/desk/clock";
import { db } from "@/db/client";

export async function ensureDayReminders(accountId: string, day?: string) {
  const when = dayParam(day ?? todaySaoPaulo());
  const tomorrow = shiftDay(when, 1);

  const appointments = await db()<
    {
      id: string;
      clientId: string;
      clientName: string;
      phone: string;
      start: string;
      serviceName: string;
      professionalName: string;
    }[]
  >`
    SELECT a.id, a.client_id AS "clientId", c.name AS "clientName", c.phone,
           to_char(a.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI') AS start,
           COALESCE(s.name, 'Horário') AS "serviceName",
           COALESCE(NULLIF(p.nickname, ''), p.name, '—') AS "professionalName"
    FROM appointments a
    JOIN clients c ON c.id = a.client_id
    LEFT JOIN services s ON s.id = a.service_id
    LEFT JOIN professionals p ON p.id = a.professional_id
    WHERE a.account_id = ${accountId}
      AND a.kind = 'horario'
      AND a.status NOT IN ('cancelado', 'ausente', 'realizado')
      AND a.client_id IS NOT NULL
      AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date = ${tomorrow}::date
  `;

  for (const row of appointments) {
    const body = `Lembrete: ${row.clientName} (${formatPhone(row.phone)}) · ${formatDay(tomorrow)} ${row.start} · ${row.serviceName} com ${row.professionalName}`;
    await db()`
      INSERT INTO reminders (id, account_id, kind, client_id, appointment_id, day, body, status)
      VALUES (${randomUUID()}, ${accountId}, 'agendamento', ${row.clientId}, ${row.id}, ${tomorrow}::date, ${body}, 'pendente')
      ON CONFLICT (account_id, kind, appointment_id) DO NOTHING
    `;
  }

  const birthdays = await birthdaysAhead(accountId, when, 1);
  for (const person of birthdays.filter((row) => row.kind === "cliente" && row.day === when)) {
    const body = `Aniversário hoje: ${person.name}${person.phone ? ` · ${formatPhone(person.phone)}` : ""} · faz ${person.turning}`;
    await db()`
      INSERT INTO reminders (id, account_id, kind, client_id, appointment_id, day, body, status)
      VALUES (${randomUUID()}, ${accountId}, 'aniversario', ${person.id}, null, ${when}::date, ${body}, 'pendente')
      ON CONFLICT (account_id, kind, client_id, day) DO NOTHING
    `;
  }
}

export async function listReminders(accountId: string, day: string) {
  await ensureDayReminders(accountId, day);
  const when = dayParam(day);
  return db()<
    {
      id: string;
      kind: string;
      day: string;
      body: string;
      status: string;
      clientId: string | null;
      appointmentId: string | null;
    }[]
  >`
    SELECT id, kind, to_char(day, 'YYYY-MM-DD') AS day, body, status,
           client_id AS "clientId", appointment_id AS "appointmentId"
    FROM reminders
    WHERE account_id = ${accountId}
      AND day BETWEEN ${when}::date AND (${when}::date + 1)
    ORDER BY
      CASE status WHEN 'pendente' THEN 0 WHEN 'feito' THEN 1 ELSE 2 END,
      kind, day, created_at
  `;
}

export async function setReminderStatus(accountId: string, id: string, status: "feito" | "cancelado" | "pendente") {
  await db()`
    UPDATE reminders SET status = ${status}
    WHERE id = ${id} AND account_id = ${accountId}
  `;
}
