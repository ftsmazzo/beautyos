"use client";

import { useState } from "react";
import { settlePayable } from "@/finance/actions";
import { SubmitButton } from "@/ui/submit-button";

export function PayableSettle({
  id,
  banks,
  today,
  paid,
}: {
  id: string;
  banks: { id: string; name: string }[];
  today: string;
  paid: boolean;
}) {
  const [method, setMethod] = useState("pix");
  if (banks.length === 0) return <span>Cadastre um banco para lançar a baixa.</span>;

  return (
    <details>
      <summary>{paid ? "Lançar no extrato" : "Dar baixa"}</summary>
      <form action={settlePayable}>
        <input type="hidden" name="id" value={id} />
        <label>
          Banco
          <select name="bank" required defaultValue={banks[0]?.id ?? ""}>
            {banks.map((bank) => (
              <option key={bank.id} value={bank.id}>
                {bank.name}
              </option>
            ))}
          </select>
        </label>
        {paid ? null : (
          <>
            <label>
              Data
              <input type="date" name="day" required defaultValue={today} />
            </label>
            <label>
              Forma
              <select name="method" value={method} onChange={(event) => setMethod(event.target.value)}>
                <option value="pix">Pix</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="outros">Outros</option>
              </select>
            </label>
            {method === "debito" || method === "credito" ? (
              <label>
                Bandeira
                <input name="brand" required minLength={2} placeholder="Visa, Master, Elo" />
              </label>
            ) : null}
          </>
        )}
        <SubmitButton label={paid ? "Lançar" : "Baixar"} pendingLabel="Lançando…" className="quiet" />
      </form>
    </details>
  );
}
