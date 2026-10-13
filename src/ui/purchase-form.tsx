"use client";

import { useState } from "react";
import { savePurchase } from "@/catalog/product-actions";
import { SubmitButton } from "@/ui/submit-button";

export function PurchaseForm({
  products,
  suppliers,
  today,
}: {
  products: { id: string; name: string }[];
  suppliers: { id: string; name: string; city: string | null }[];
  today: string;
}) {
  const [rows, setRows] = useState([0]);
  const [bill, setBill] = useState(false);
  const [paid, setPaid] = useState(false);
  const [method, setMethod] = useState("pix");

  return (
    <form action={savePurchase}>
      <label>
        Fornecedor
        <select name="supplier" defaultValue={suppliers[0]?.id ?? ""}>
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
      {rows.map((row) => (
        <div className="split" key={row}>
          <label>
            Produto
            <select name="product" defaultValue="">
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
      <p>O custo desta entrada passa a ser o custo do produto. Preço de venda e comissão não mudam.</p>
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
            </div>
          ) : null}
          <p>A conta fica no financeiro. Não sai do caixa do balcão.</p>
        </>
      ) : null}
      <SubmitButton label="Lançar compra" pendingLabel="Lançando…" />
    </form>
  );
}
