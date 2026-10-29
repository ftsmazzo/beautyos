"use client";

import { useState } from "react";
import { centsToInput, formatReais, formatRate } from "@/catalog/format";
import { addPayment } from "@/desk/actions";
import { PAYMENT_METHODS } from "@/desk/statuses";
import { SubmitButton } from "@/ui/submit-button";

type Brand = { id: string; name: string; debitBps: number; creditBps: number };
type Machine = { id: string; name: string; debitBps: number; creditBps: number; brands: Brand[] };

export function PaymentForm({
  orderId,
  banks,
  acquirers,
  totalCents,
  paidCents,
  dueCents,
}: {
  orderId: string;
  banks: { id: string; name: string }[];
  acquirers: Machine[];
  totalCents: number;
  paidCents: number;
  dueCents: number;
}) {
  const [method, setMethod] = useState("pix");
  const [acquirerId, setAcquirerId] = useState(acquirers[0]?.id ?? "");
  const machine = acquirers.find((item) => item.id === acquirerId) ?? acquirers[0];
  const brands = machine?.brands ?? [];
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const card = method === "debito" || method === "credito";
  const brand = brands.find((item) => item.id === brandId) ?? brands[0];
  const rateOf = (row: { debitBps: number; creditBps: number }) =>
    formatRate(method === "debito" ? row.debitBps : row.creditBps);
  const due = Math.max(0, dueCents);

  return (
    <form action={addPayment}>
      <input type="hidden" name="order" value={orderId} />
      <div className="payment-due">
        <div>
          <span>Total da comanda</span>
          <strong>{formatReais(totalCents)}</strong>
        </div>
        {paidCents > 0 ? (
          <div>
            <span>Já pago</span>
            <strong>{formatReais(paidCents)}</strong>
          </div>
        ) : null}
        <div>
          <span>A receber</span>
          <strong>{formatReais(due)}</strong>
        </div>
      </div>
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
          <input
            key={due}
            name="amount"
            inputMode="decimal"
            defaultValue={centsToInput(due)}
            placeholder="0,00"
            required
          />
        </label>
        {card && acquirers.length > 0 ? (
          <label>
            Máquina
            <select
              name="acquirer"
              required
              value={machine?.id ?? ""}
              onChange={(event) => {
                const next = acquirers.find((item) => item.id === event.target.value);
                setAcquirerId(event.target.value);
                setBrandId(next?.brands[0]?.id ?? "");
              }}
            >
              {acquirers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.brands.length === 0 ? ` · ${rateOf(item)}` : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {card && brands.length > 0 ? (
          <label>
            Bandeira
            <select name="brand" required value={brand?.id ?? ""} onChange={(event) => setBrandId(event.target.value)}>
              {brands.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {rateOf(item)}
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
