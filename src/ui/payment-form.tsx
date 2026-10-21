"use client";

import { useState } from "react";
import { formatRate } from "@/catalog/format";
import { addPayment } from "@/desk/actions";
import { PAYMENT_METHODS } from "@/desk/statuses";
import { SubmitButton } from "@/ui/submit-button";

export function PaymentForm({
  orderId,
  banks,
  acquirers,
}: {
  orderId: string;
  banks: { id: string; name: string }[];
  acquirers: { id: string; name: string; debitBps: number; creditBps: number }[];
}) {
  const [method, setMethod] = useState("pix");
  const card = method === "debito" || method === "credito";

  return (
    <form action={addPayment}>
      <input type="hidden" name="order" value={orderId} />
      <div className="split">
        <label>
          Forma
          <select name="method" value={method} onChange={(event) => setMethod(event.target.value)}>
            {PAYMENT_METHODS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Valor
          <input name="amount" inputMode="decimal" placeholder="0,00" required />
        </label>
        {card && acquirers.length > 0 ? (
          <label>
            Máquina
            <select name="acquirer" required defaultValue={acquirers[0]?.id}>
              {acquirers.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name} · {formatRate(method === "debito" ? machine.debitBps : machine.creditBps)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {banks.length > 0 ? (
          <label>
            Destino
            <select name="bank" defaultValue="">
              <option value="">Caixa do balcão</option>
              {banks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <SubmitButton label="Lançar pagamento" pendingLabel="Lançando…" />
    </form>
  );
}
