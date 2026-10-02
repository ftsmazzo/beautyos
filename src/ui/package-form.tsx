"use client";

import { useMemo, useState } from "react";
import { centsToInput, formatReais, packageGap, parseReais } from "@/catalog/format";
import { SubmitButton } from "@/ui/submit-button";

type ServiceOpt = { id: string; name: string; priceCents: number };
type ProductOpt = { id: string; name: string };
type ProductRow = { productId: string; qty: string; price: string };
type VisitGroup = { serviceId: string; prices: string[] };

export type PackageInitial = {
  id: string;
  name: string;
  notes: string;
  forSale: boolean;
  validityDays: string;
  saleCommission: string;
  groups: VisitGroup[];
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
  const [groups, setGroups] = useState<VisitGroup[]>(initial.groups.length ? initial.groups : [{ serviceId: "", prices: [""] }]);
  const [rows, setRows] = useState<ProductRow[]>(initial.products);
  const [splitTotal, setSplitTotal] = useState("");

  const visitSum = groups.reduce((sum, group) => sum + group.prices.reduce((inner, price) => inner + (parseReais(price) ?? 0), 0), 0);
  const productSum = rows.reduce((sum, row) => sum + (parseReais(row.price) ?? 0), 0);
  const total = visitSum + productSum;
  const avulso = groups.reduce((sum, group) => {
    const service = services.find((item) => item.id === group.serviceId);
    return sum + (service?.priceCents ?? 0) * group.prices.length;
  }, 0);
  const summary = useMemo(() => {
    const named = groups.flatMap((group) => {
      const service = services.find((item) => item.id === group.serviceId);
      const word = group.prices.length === 1 ? "ida" : "idas";
      return service ? [`${group.prices.length} ${word} de ${service.name}`] : [];
    });
    if (!named.length) return "Inclua os serviços para ver a diferença do avulso.";
    return `${named.join(". ")}. Avulso ${formatReais(avulso)}. ${packageGap(avulso, visitSum)}. Preço do pacote ${formatReais(total)}.`;
  }, [groups, services, avulso, visitSum, total]);

  function updateGroup(index: number, next: VisitGroup) {
    setGroups(groups.map((group, groupIndex) => (groupIndex === index ? next : group)));
  }

  function chooseService(index: number, id: string) {
    const price = services.find((service) => service.id === id)?.priceCents;
    const group = groups[index];
    updateGroup(index, {
      serviceId: id,
      prices: price == null ? group.prices : group.prices.map((value) => (value.trim() ? value : centsToInput(price))),
    });
  }

  function setVisitCount(index: number, raw: string) {
    const group = groups[index];
    const count = Math.max(1, Math.min(60, Number(raw) || 1));
    const next = group.prices.slice(0, count);
    const selected = services.find((service) => service.id === group.serviceId);
    const fill = [...next].reverse().find((value) => value.trim()) || (selected ? centsToInput(selected.priceCents) : "");
    while (next.length < count) next.push(fill);
    updateGroup(index, { ...group, prices: next });
  }

  function optionsFor(index: number) {
    const taken = new Set(groups.flatMap((group, groupIndex) => (groupIndex === index || !group.serviceId ? [] : [group.serviceId])));
    return services.filter((service) => !taken.has(service.id));
  }

  function splitEven() {
    const target = parseReais(splitTotal);
    const count = groups.reduce((sum, group) => sum + group.prices.length, 0);
    if (target == null || count < 1) return;
    const serviceTotal = target - productSum;
    if (serviceTotal < 0) return;
    const base = Math.floor(serviceTotal / count);
    const rest = serviceTotal - base * count;
    let cursor = 0;
    setGroups(groups.map((group) => ({
      ...group,
      prices: group.prices.map(() => {
        const cents = cursor === count - 1 ? base + rest : base;
        cursor += 1;
        return centsToInput(cents);
      }),
    })));
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
      {groups.map((group, index) => (
        <div className="card" key={index}>
          <label>
            Serviço
            <select required value={group.serviceId} onChange={(event) => chooseService(index, event.target.value)}>
              <option value="">Escolha</option>
              {optionsFor(index).map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · avulso {formatReais(service.priceCents)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Idas
            <input type="number" min={1} max={60} value={group.prices.length} onChange={(event) => setVisitCount(index, event.target.value)} />
          </label>
          {group.prices.map((price, priceIndex) => (
            <label key={priceIndex}>
              Preço interno da ida {priceIndex + 1}
              <input type="hidden" name="visit_service" value={group.serviceId} />
              <input
                name="visit_price"
                required
                value={price}
                onChange={(event) => {
                  const prices = [...group.prices];
                  prices[priceIndex] = event.target.value;
                  updateGroup(index, { ...group, prices });
                }}
              />
            </label>
          ))}
          {groups.length > 1 ? (
            <button type="button" className="btn quiet" onClick={() => setGroups(groups.filter((_, groupIndex) => groupIndex !== index))}>
              Tirar serviço
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className="btn quiet"
        onClick={() => setGroups([...groups, { serviceId: "", prices: [""] }])}
      >
        Incluir serviço
      </button>
      <div className="row">
        <label>
          Dividir este total entre as idas
          <input value={splitTotal} onChange={(event) => setSplitTotal(event.target.value)} placeholder="0,00" />
        </label>
        <button type="button" className="btn quiet" onClick={splitEven}>
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
            className="btn quiet"
            onClick={() => setRows(rows.filter((_, rowIndex) => rowIndex !== index))}
          >
            Tirar
          </button>
        </div>
      ))}
      <button type="button" className="btn quiet" onClick={() => setRows([...rows, { productId: "", qty: "1", price: "" }])}>
        Incluir produto
      </button>
      <p>{summary}</p>
      <SubmitButton label="Salvar pacote" />
    </form>
  );
}
