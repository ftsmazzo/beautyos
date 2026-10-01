"use client";

import { useMemo, useState } from "react";
import { centsToInput, formatReais, packageGap, parseReais } from "@/catalog/format";
import { SubmitButton } from "@/ui/submit-button";

type ServiceOpt = { id: string; name: string; priceCents: number };
type ProductOpt = { id: string; name: string };
type ProductRow = { productId: string; qty: string; price: string };

export type PackageInitial = {
  id: string;
  name: string;
  notes: string;
  forSale: boolean;
  validityDays: string;
  saleCommission: string;
  serviceId: string;
  visitPrices: string[];
  products: ProductRow[];
};

export function PackageForm({
  action,
  services,
  products,
  initial,
}: {
  action: (formData: FormData) => void;
  services: ServiceOpt[];
  products: ProductOpt[];
  initial: PackageInitial;
}) {
  const [serviceId, setServiceId] = useState(initial.serviceId);
  const [prices, setPrices] = useState(initial.visitPrices.length ? initial.visitPrices : [""]);
  const [rows, setRows] = useState<ProductRow[]>(initial.products);
  const [splitTotal, setSplitTotal] = useState("");

  const selected = services.find((service) => service.id === serviceId);
  const visitSum = prices.reduce((sum, price) => sum + (parseReais(price) ?? 0), 0);
  const productSum = rows.reduce((sum, row) => sum + (parseReais(row.price) ?? 0), 0);
  const total = visitSum + productSum;
  const avulso = (selected?.priceCents ?? 0) * prices.length;
  const summary = useMemo(() => {
    if (!selected) return "Escolha o serviço para ver a diferença do avulso.";
    return `${prices.length} idas de ${selected.name}. Avulso ${formatReais(avulso)}. ${packageGap(avulso, visitSum)}. Preço do pacote ${formatReais(total)}.`;
  }, [selected, prices.length, avulso, visitSum, total]);

  function chooseService(id: string) {
    setServiceId(id);
    const price = services.find((service) => service.id === id)?.priceCents;
    if (price == null) return;
    setPrices((current) => current.map((value) => (value.trim() ? value : centsToInput(price))));
  }

  function setVisitCount(raw: string) {
    const count = Math.max(1, Math.min(60, Number(raw) || 1));
    setPrices((current) => {
      const next = current.slice(0, count);
      const fill = [...next].reverse().find((value) => value.trim()) || (selected ? centsToInput(selected.priceCents) : "");
      while (next.length < count) next.push(fill);
      return next;
    });
  }

  function splitEven() {
    const target = parseReais(splitTotal);
    if (target == null || prices.length < 1) return;
    const productPart = rows.reduce((sum, row) => sum + (parseReais(row.price) ?? 0), 0);
    const serviceTotal = target - productPart;
    if (serviceTotal < 0) return;
    const base = Math.floor(serviceTotal / prices.length);
    const rest = serviceTotal - base * prices.length;
    setPrices(prices.map((_, index) => centsToInput(index === prices.length - 1 ? base + rest : base)));
  }

  return (
    <form action={action}>
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <label>
        Nome
        <input name="name" required minLength={2} defaultValue={initial.name} />
      </label>
      <label>
        Observação
        <textarea name="notes" defaultValue={initial.notes} />
      </label>
      <label className="check">
        <input type="checkbox" name="for_sale" value="1" defaultChecked={initial.forSale} />
        À venda
      </label>
      <label>
        Dias de validade
        <input name="validity_days" type="number" required min={1} max={3650} defaultValue={initial.validityDays} />
      </label>
      <p>O prazo corre a partir do primeiro uso.</p>
      <label>
        Comissão da venda (%)
        <input name="sale_commission" inputMode="numeric" defaultValue={initial.saleCommission} placeholder="Em branco fica zero" />
      </label>
      <label>
        Serviço
        <select name="service_id" required value={serviceId} onChange={(event) => chooseService(event.target.value)}>
          <option value="">Escolha</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} · avulso {formatReais(service.priceCents)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Idas
        <input type="number" min={1} max={60} value={prices.length} onChange={(event) => setVisitCount(event.target.value)} />
      </label>
      {prices.map((price, index) => (
        <label key={index}>
          Preço interno da ida {index + 1}
          <input name="visit_price" required value={price} onChange={(event) => {
            const next = [...prices];
            next[index] = event.target.value;
            setPrices(next);
          }} />
        </label>
      ))}
      <div className="row">
        <label>
          Dividir este total entre as idas
          <input value={splitTotal} onChange={(event) => setSplitTotal(event.target.value)} placeholder="0,00" />
        </label>
        <button type="button" className="ghost" onClick={splitEven}>
          Dividir
        </button>
      </div>
      <p>O valor dos produtos sai antes da divisão. O preço do pacote é a soma, sem um segundo total.</p>
      {rows.map((row, index) => (
        <div className="row" key={index}>
          <label>
            Produto
            <select
              name="product_id"
              value={row.productId}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, productId: event.target.value };
                setRows(next);
              }}
            >
              <option value="">Nenhum</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantidade
            <input
              name="product_qty"
              type="number"
              min={1}
              value={row.qty}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, qty: event.target.value };
                setRows(next);
              }}
            />
          </label>
          <label>
            Valor no pacote
            <input
              name="product_price"
              value={row.price}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, price: event.target.value };
                setRows(next);
              }}
            />
          </label>
          <button
            type="button"
            className="ghost"
            onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}
          >
            Tirar
          </button>
        </div>
      ))}
      <button type="button" className="ghost" onClick={() => setRows([...rows, { productId: "", qty: "1", price: "" }])}>
        Incluir produto
      </button>
      <p>{summary}</p>
      <SubmitButton label="Salvar pacote" />
    </form>
  );
}
