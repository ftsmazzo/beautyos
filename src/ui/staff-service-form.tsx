"use client";

import { useState } from "react";
import { addStaffService } from "@/desk/actions";
import { SubmitButton } from "@/ui/submit-button";

export function StaffServiceForm({
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
    <form action={addStaffService}>
      <input type="hidden" name="order" value={orderId} />
      <label>
        Quem executou
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
      <p>Fica nesta comanda, de quem recebeu. Não entra na agenda. O caixa continua zerado.</p>
      <SubmitButton label="Lançar serviço" pendingLabel="Lançando…" className="teal" />
    </form>
  );
}
