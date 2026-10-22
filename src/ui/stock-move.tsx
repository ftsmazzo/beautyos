"use client";

import { useState } from "react";
import { moveStock } from "@/catalog/product-actions";
import { SubmitButton } from "@/ui/submit-button";

export function StockIn({ productId }: { productId: string }) {
  const [reason, setReason] = useState("ajuste");
  return (
    <form action={moveStock}>
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="back" value="lista" />
      <label>
        Motivo
        <select name="reason" value={reason} onChange={(event) => setReason(event.target.value)}>
          <option value="ajuste">Ajuste</option>
          <option value="compra">Compra</option>
        </select>
      </label>
      <label>
        Quantidade
        <input name="qty" type="number" min={1} required />
      </label>
      {reason === "compra" ? (
        <label>
          Custo unitário
          <input name="unit" required placeholder="0,00" />
        </label>
      ) : null}
      <label>
        Observação
        <input name="note" />
      </label>
      <SubmitButton label="Lançar" pendingLabel="Lançando…" />
    </form>
  );
}

export function StockOut({ productId }: { productId: string }) {
  return (
    <form action={moveStock}>
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="back" value="lista" />
      <input type="hidden" name="reason" value="ajuste" />
      <input type="hidden" name="sign" value="out" />
      <label>
        Quantidade
        <input name="qty" type="number" min={1} required />
      </label>
      <label>
        Observação
        <input name="note" />
      </label>
      <SubmitButton label="Lançar" pendingLabel="Lançando…" />
    </form>
  );
}

export function StockCount({ productId, balance }: { productId: string; balance: number }) {
  const [raw, setRaw] = useState("");
  const counted = raw.trim() === "" ? null : Number(raw);
  const valid = counted != null && Number.isInteger(counted) && counted >= 0;
  const diff = valid && counted != null ? counted - balance : null;
  return (
    <form action={moveStock}>
      <input type="hidden" name="id" value={productId} />
      <input type="hidden" name="back" value="conferencia" />
      <input type="hidden" name="reason" value="conferencia" />
      <label>
        Contada
        <input name="qty" type="number" min={0} required value={raw} onChange={(event) => setRaw(event.target.value)} />
      </label>
      <p>{diff == null ? "Diferença —" : diff === 0 ? "Igual ao saldo" : `Diferença ${diff > 0 ? `+${diff}` : diff}`}</p>
      {diff != null && diff !== 0 ? <SubmitButton label="Confirmar" pendingLabel="Confirmando…" /> : null}
    </form>
  );
}
