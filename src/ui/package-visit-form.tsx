"use client";

import { useState } from "react";
import { WEEKDAYS } from "@/catalog/labels";
import { repeatPackageVisits, schedulePackageVisit } from "@/desk/actions";
import { SubmitButton } from "@/ui/submit-button";

export function PackageVisitForm({
  orderId,
  credits,
  people,
}: {
  orderId: string;
  credits: { id: string; serviceId: string; serviceName: string; label: string }[];
  people: { id: string; name: string; serviceIds: string[] }[];
}) {
  const [creditId, setCreditId] = useState(credits[0]?.id ?? "");
  const serviceId = credits.find((credit) => credit.id === creditId)?.serviceId ?? "";
  const offered = people.filter((person) => person.serviceIds.includes(serviceId));
  const professional = offered[0]?.id ?? "";

  return (
    <>
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
      <SubmitButton label="Marcar" pendingLabel="Marcando…" />
    </form>
    <RepeatForm orderId={orderId} credits={credits} people={people} />
    </>
  );
}

function RepeatForm({
  orderId,
  credits,
  people,
}: {
  orderId: string;
  credits: { id: string; serviceId: string; serviceName: string }[];
  people: { id: string; name: string; serviceIds: string[] }[];
}) {
  const services = [...new Map(credits.map((credit) => [credit.serviceId, credit.serviceName])).entries()];
  const [serviceId, setServiceId] = useState(services[0]?.[0] ?? "");
  const offered = people.filter((person) => person.serviceIds.includes(serviceId));
  const professional = offered[0]?.id ?? "";

  return (
    <form action={repeatPackageVisits}>
      <input type="hidden" name="order" value={orderId} />
      <label>
        Repetir o serviço
        <select name="service" required value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
          {services.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
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
          Dia da semana
          <select name="weekday" required defaultValue="1">
            {WEEKDAYS.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Início
          <input name="start" type="time" required defaultValue="09:00" />
        </label>
      </div>
      <SubmitButton label="Repetir" pendingLabel="Repetindo…" className="quiet" />
    </form>
  );
}
