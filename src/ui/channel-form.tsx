"use client";

import { useState } from "react";
import { CHANNELS } from "@/catalog/labels";
import { setClientChannel } from "@/desk/actions";
import { SubmitButton } from "@/ui/submit-button";

export function ChannelForm({
  orderId,
  clientId,
  professionals,
  clients,
  housePercent,
}: {
  orderId: string;
  clientId: string;
  professionals: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  housePercent: number;
}) {
  const [channel, setChannel] = useState("");

  return (
    <form action={setClientChannel}>
      <input type="hidden" name="order" value={orderId} />
      <input type="hidden" name="client" value={clientId} />
      <label>
        Canal
        <select name="channel" required value={channel} onChange={(event) => setChannel(event.target.value)}>
          <option value="" disabled>
            Escolha
          </option>
          {CHANNELS.filter((item) => item.value !== "nao_informado").map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      {channel === "indicacao" ? (
        <div className="split">
          <label>
            Profissional que indicou
            <select name="referrer_professional" defaultValue="">
              <option value="">Ninguém</option>
              {professionals.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cliente que indicou
            <select name="referrer_client" defaultValue="">
              <option value="">Ninguém</option>
              {clients
                .filter((person) => person.id !== clientId)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Comissão desta indicação (%)
            <input name="referral_commission" inputMode="numeric" placeholder={String(housePercent)} />
          </label>
        </div>
      ) : null}
      <SubmitButton label="Guardar canal" pendingLabel="Guardando…" />
    </form>
  );
}
