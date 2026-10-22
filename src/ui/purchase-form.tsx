"use client";

import { useState } from "react";
import { savePurchase } from "@/catalog/product-actions";
import { SubmitButton } from "@/ui/submit-button";

export function PurchaseForm({
  products,
  suppliers,
  banks,
  cards,
  charts,
  aliases,
  today,
}: {
  products: { id: string; name: string; supplierId: string | null }[];
  suppliers: { id: string; name: string; city: string | null }[];
  banks: { id: string; name: string }[];
  cards: { id: string; name: string }[];
  charts: { id: string; code: string; name: string }[];
  aliases: { supplierId: string; label: string; productId: string; productName: string }[];
  today: string;
}) {
  const [rows, setRows] = useState([0]);
  const [bill, setBill] = useState(false);
  const [paid, setPaid] = useState(false);
  const [method, setMethod] = useState("pix");
  const [supplierId, setSupplierId] = useState("");
  const [supplierTouched, setSupplierTouched] = useState(false);
  const [picked, setPicked] = useState<Record<number, string>>({});
  const known = aliases.filter((item) => item.supplierId === supplierId);

  function fillSupplier(productId: string) {
    if (supplierTouched || !productId) return;
    const product = products.find((item) => item.id === productId);
    if (product?.supplierId) setSupplierId(product.supplierId);
  }

  function remember(row: number, raw: string) {
    const key = raw.trim().replace(/\s+/g, " ").toLowerCase();
    if (key.length < 2 || !supplierId) return;
    const hit = aliases.find((item) => item.supplierId === supplierId && item.label === key);
    if (!hit) return;
    setPicked((current) => ({ ...current, [row]: hit.productId }));
    fillSupplier(hit.productId);
  }

  function chooseProduct(row: number, productId: string) {
    setPicked((current) => ({ ...current, [row]: productId }));
    fillSupplier(productId);
  }

  return (
    <form action={savePurchase}>
      <label>
        Fornecedor
        <select
          name="supplier"
          value={supplierId}
          onChange={(event) => {
            setSupplierTouched(true);
            setSupplierId(event.target.value);
          }}
        >
          <option value="">Cadastrar agora</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
              {supplier.city ? ` · ${supplier.city}` : ""}
            </option>
          ))}
        </select>
      </label>
      <div className="split">
        <label>
          Nome, se for novo
          <input name="supplier_name" />
        </label>
        <label>
          Telefone
          <input name="supplier_phone" />
        </label>
        <label>
          CNPJ
          <input name="supplier_cnpj" />
        </label>
        <label>
          Cidade
          <input name="supplier_city" />
        </label>
      </div>
      <div className="split">
        <label>
          Número da nota
          <input name="document" required />
        </label>
        <label>
          Data
          <input type="date" name="day" required defaultValue={today} />
        </label>
      </div>
      {known.length > 0 ? (
        <div className="desk-bar">
          {known.map((item) => (
            <span className="chip" key={`${item.supplierId}-${item.productId}-${item.label}`}>
              {item.label} → {item.productName}
            </span>
          ))}
        </div>
      ) : null}
      {rows.map((row) => (
        <div className="split" key={row}>
          <label>
            Como veio na nota
            <input name="label" onChange={(event) => remember(row, event.target.value)} />
          </label>
          <label>
            Produto
            <select
              name="product"
              value={picked[row] ?? ""}
              onChange={(event) => chooseProduct(row, event.target.value)}
            >
              <option value="">Não incluir</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantidade
            <input name="qty" type="number" min={1} defaultValue={1} />
          </label>
          <label>
            Custo unitário
            <input name="cost" placeholder="0,00" />
          </label>
        </div>
      ))}
      <button type="button" className="btn quiet" onClick={() => setRows((current) => [...current, current.length])}>
        Incluir produto
      </button>
      <label className="check">
        <input type="checkbox" name="bill" value="1" checked={bill} onChange={(event) => setBill(event.target.checked)} />
        Lançar em contas a pagar
      </label>
      {bill ? (
        <>
          <div className="split">
            <label>
              Vencimento
              <input type="date" name="due" required defaultValue={today} />
            </label>
            <label>
              Vezes
              <input name="times" type="number" min={1} max={36} defaultValue={1} required />
            </label>
          </div>
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
        </>
      ) : null}
      <SubmitButton label="Lançar compra" pendingLabel="Lançando…" />
    </form>
  );
}
