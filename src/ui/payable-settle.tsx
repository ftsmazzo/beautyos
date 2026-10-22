"use client";

import { useState } from "react";
import { settlePayable } from "@/finance/actions";
import { Modal } from "@/ui/modal";
import { SubmitButton } from "@/ui/submit-button";

export function PayableSettle({
  id,
  banks,
  cards,
  charts,
  today,
  paid,
  method: paidMethod,
}: {
  id: string;
  banks: { id: string; name: string }[];
  cards: { id: string; name: string }[];
  charts: { id: string; code: string; name: string }[];
  today: string;
  paid: boolean;
  method: string | null;
}) {
  const [method, setMethod] = useState(paidMethod === "credito" ? "credito" : "pix");
  const credit = paid ? paidMethod === "credito" : method === "credito";
  const missing = credit ? cards.length === 0 : banks.length === 0;

  const label = paid ? (credit ? "Lançar na fatura" : "Lançar no extrato") : "Dar baixa";

  return (
    <Modal label={label} title={label} tone={paid ? "navy" : "teal"}>
      {missing ? (
        <p className="queue-empty">
          {credit ? "Cadastre um cartão para lançar no crédito." : "Cadastre um banco para lançar a baixa."}
        </p>
      ) : null}
      {missing ? null : (
        <form action={settlePayable}>
          <input type="hidden" name="id" value={id} />
          {charts.length > 0 ? (
            <label>
              Plano
              <select name="chart" defaultValue="">
                <option value="">Sem conta</option>
                {charts.map((chart) => (
                  <option key={chart.id} value={chart.id}>
                    {chart.code} {chart.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {credit ? (
            <label>
              Cartão
              <select name="card" required defaultValue={cards[0]?.id ?? ""}>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
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
          )}
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
          <SubmitButton label={credit ? "Lançar" : "Baixar"} pendingLabel="Lançando…" className="quiet" />
        </form>
      )}
    </Modal>
  );
}
