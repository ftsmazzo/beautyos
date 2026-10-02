"use client";

import { useState } from "react";
import { schedulePackageVisit } from "@/desk/actions";
import { SubmitButton } from "@/ui/submit-button";

export function PackageVisitForm({
  orderId,
  credits,
  people,
}: {
  orderId: string;
  credits: { id: string; serviceId: string; label: string }[];
  people: { id: string; name: string; serviceIds: string[] }[];
}) {
  const [creditId, setCreditId] = useState(credits[0]?.id ?? "");
  const serviceId = credits.find((credit) => credit.id === creditId)?.serviceId ?? "";
  const offered = people.filter((person) => person.serviceIds.includes(serviceId));
  const professional = offered[0]?.id ?? "";

  return (
    <form action={schedulePackageVisit}>
      <input type="hidden" name="order" value={orderId} />
      <label>
        Visita
        <select name="credit" required value={creditId} onChange={(event) => setCreditId(event.target.value)}>
          {credits.map((credit) => (
            <option key={credit.id} value={credit.id}>
              {credit.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Profissional
        <select name="professional" required defaultValue={professional} key={professional}>
          {offered.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <div className="split">
        <label>
          Dia
          <input name="day" type="date" required />
        </label>
        <label>
          Início
          <input name="start" type="time" required defaultValue="09:00" />
        </label>
      </div>
      <p>A visita entra na agenda e na comanda daquele dia, sem nova cobrança. A comissão fica no preço interno.</p>
      <SubmitButton label="Marcar" pendingLabel="Marcando…" />
    </form>
  );
}
