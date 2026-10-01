"use client";

import { useState } from "react";
import { bookSlot } from "@/desk/actions";
import { SubmitButton } from "@/ui/submit-button";

export function BookForm({
  day,
  lockedProfessional,
  professionals,
  services,
  clients,
}: {
  day: string;
  lockedProfessional: string | null;
  professionals: { id: string; name: string }[];
  services: { id: string; name: string; professionalIds: string[] }[];
  clients: { id: string; name: string }[];
}) {
  const [professional, setProfessional] = useState(lockedProfessional ?? professionals[0]?.id ?? "");
  const offered = services.filter((service) => service.professionalIds.includes(professional));

  return (
    <form action={bookSlot}>
      <input type="hidden" name="day" value={day} />
      {lockedProfessional ? (
        <input type="hidden" name="professional" value={lockedProfessional} />
      ) : (
        <label>
          Profissional
          <select name="professional" value={professional} onChange={(event) => setProfessional(event.target.value)} required>
            {professionals.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Serviço
        <select name="service" required defaultValue="">
          <option value="" disabled>
            Escolha
          </option>
          {offered.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </label>
      {offered.length === 0 ? <p>Esse profissional ainda não tem serviço na ficha.</p> : null}
      <label>
        Cliente
        <select name="client" defaultValue="">
          <option value="">Sem nome</option>
          {clients.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <div className="split">
        <label>
          Início
          <input name="start" type="time" required defaultValue="09:00" />
        </label>
        <label className="check">
          <input name="encaixe" type="checkbox" value="1" />
          Encaixe
        </label>
      </div>
      <p>Sem a marca de encaixe, o horário precisa caber no expediente e não pode cair em cima de outro.</p>
      <SubmitButton label="Marcar" pendingLabel="Marcando…" />
    </form>
  );
}
