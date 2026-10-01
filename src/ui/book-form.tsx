"use client";

import { useState } from "react";
import { bookSlot } from "@/desk/actions";
import { SubmitButton } from "@/ui/submit-button";

export function BookForm({
  day,
  lockedProfessional,
  initialProfessional,
  initialStart = "09:00",
  initialEncaixe = false,
  professionals,
  services,
  clients,
}: {
  day: string;
  lockedProfessional: string | null;
  initialProfessional?: string;
  initialStart?: string;
  initialEncaixe?: boolean;
  professionals: { id: string; name: string }[];
  services: { id: string; name: string; professionalIds: string[] }[];
  clients: { id: string; name: string }[];
}) {
  const [professional, setProfessional] = useState(lockedProfessional ?? initialProfessional ?? professionals[0]?.id ?? "");
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
          <input name="start" type="time" required defaultValue={initialStart} />
        </label>
        <label className="check">
          <input name="encaixe" type="checkbox" value="1" defaultChecked={initialEncaixe} />
          Encaixe
        </label>
      </div>
      <p>Marcar abre a comanda desse cliente neste dia. Sem encaixe, o horário precisa caber no expediente.</p>
      <SubmitButton label="Marcar" pendingLabel="Marcando…" />
    </form>
  );
}
