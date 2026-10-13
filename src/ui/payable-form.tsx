"use client";

import { useState } from "react";
import { saveTitle } from "@/finance/actions";
import { SubmitButton } from "@/ui/submit-button";

export function PayableForm({
  banks,
  cards,
  charts,
  today,
}: {
  banks: { id: string; name: string }[];
  cards: { id: string; name: string }[];
  charts: { id: string; code: string; name: string }[];
  today: string;
}) {
  const [paid, setPaid] = useState(false);
  const [method, setMethod] = useState("pix");
  const [mode, setMode] = useState("uma");

  return (
    <form action={saveTitle}>
      <div className="split">
        <label>
          Descrição
          <input name="description" required placeholder="Aluguel, luz, água" />
        </label>
        <label>
          Favorecido
          <input name="party" required />
        </label>
        <label>
          Valor
          <input name="amount" required placeholder="0,00" />
        </label>
        <label>
          Vencimento
          <input type="date" name="due" required defaultValue={today} />
        </label>
        <label>
          Lançamento
          <select name="mode" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="uma">Uma vez</option>
            <option value="parcela">Parcelar o valor</option>
            <option value="repete">Repetir todo mês</option>
          </select>
        </label>
        {mode !== "uma" ? (
          <label>
            {mode === "repete" ? "Meses" : "Vezes"}
            <input name="times" type="number" min={1} max={36} defaultValue={2} required />
          </label>
        ) : null}
      </div>
      {mode === "parcela" ? <p>O valor se divide nas vezes.</p> : null}
      {mode === "repete" ? <p>Cada mês entra com o mesmo valor. Se já pagou, só o primeiro mês sai do banco.</p> : null}
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
      <label className="check">
        <input type="checkbox" name="paid" value="1" checked={paid} onChange={(event) => setPaid(event.target.checked)} />
        Já pagou
      </label>
      {paid ? (
        <div className="split">
          <label>
            Pago em
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
          {method === "credito" && cards.length > 0 ? (
            <label>
              Cartão
              <select name="card" defaultValue="">
                <option value="">Fora da fatura</option>
                {cards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {method !== "credito" && banks.length > 0 ? (
            <label>
              Banco
              <select name="bank" defaultValue="">
                <option value="">Fora do extrato</option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
      <p>No crédito, a conta fica na fatura. Nas outras formas, o banco escolhido recebe a baixa. Não sai do caixa do balcão.</p>
      <SubmitButton label="Lançar conta" pendingLabel="Lançando…" />
    </form>
  );
}
