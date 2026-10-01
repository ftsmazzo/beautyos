"use client";

import { useState } from "react";
import { addServiceToOrder } from "@/desk/actions";
import { SubmitButton } from "@/ui/submit-button";

export function OrderServiceForm({
  orderId,
  professionals,
  services,
}: {
  orderId: string;
  professionals: { id: string; name: string }[];
  services: { id: string; name: string; professionalIds: string[] }[];
}) {
  const [professional, setProfessional] = useState(professionals[0]?.id ?? "");
  const offered = services.filter((service) => service.professionalIds.includes(professional));

  return (
    <form action={addServiceToOrder}>
      <input type="hidden" name="order" value={orderId} />
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
      <p>Entra nesta comanda e na coluna desse profissional.</p>
      <SubmitButton label="Lançar serviço" pendingLabel="Lançando…" />
    </form>
  );
}
