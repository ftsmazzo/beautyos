import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { centsToInput, formatReais, staffPriceCents } from "@/catalog/format";
import { STOCK_REASONS } from "@/catalog/labels";
import {
  getProduct,
  houseRules,
  listComponents,
  listMovements,
  listProducts,
  listSuppliers,
  productCategories,
} from "@/catalog/queries";
import { moveStock, saveProduct } from "@/catalog/product-actions";
import { ErrorNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ProductFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireOperator();
  const { id } = await params;
  const query = await searchParams;
  const creating = id === "novo";
  if (!creating && !UUID.test(id)) redirect("/produtos");
  const product = creating ? null : await getProduct(user.accountId, id);
  if (!creating && !product) redirect("/produtos");
  const [rules, categories, suppliers, products, components, movements] = await Promise.all([
    houseRules(user.accountId),
    productCategories(user.accountId),
    listSuppliers(user.accountId),
    listProducts(user.accountId),
    product ? listComponents(product.id) : Promise.resolve([]),
    product ? listMovements(product.id) : Promise.resolve([]),
  ]);
  const others = products.filter((item) => item.id !== product?.id);
  const staffNow = product ? staffPriceCents(product.salePriceCents, product.staffPriceCents, rules.consumption) : null;

  return (
    <Panel user={user} current="/produtos" title={product ? product.name : "Novo produto"}>
      <ErrorNote code={query.erro} />
      {product ? (
        <div className="card">
          <p>
            Saldo {product.balance}
            {product.minQty > 0 ? ` · mínimo ${product.minQty}` : ""}
            {" · margem "}
            {formatReais(product.salePriceCents - product.costCents)}
            {staffNow != null ? ` · consumo do profissional ${formatReais(staffNow)}` : ""}
          </p>
        </div>
      ) : null}
      <form action={saveProduct}>
        {product ? <input type="hidden" name="id" value={product.id} /> : null}
        <div className="split">
          <label>
            Nome
            <input name="name" required minLength={2} defaultValue={product?.name ?? ""} />
          </label>
          <label>
            Marca
            <input name="brand" defaultValue={product?.brand ?? ""} />
          </label>
          <label>
            Categoria
            <input name="category" list="categorias" defaultValue={product?.category ?? ""} />
            <datalist id="categorias">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </label>
          <label>
            Código de barras
            <input name="barcode" defaultValue={product?.barcode ?? ""} />
          </label>
        </div>
        <label>
          Observação
          <textarea name="notes" defaultValue={product?.notes ?? ""} />
        </label>
        <div className="row">
          <label className="check">
            <input type="checkbox" name="active" value="1" defaultChecked={product?.active ?? true} />
            Ativo
          </label>
          <label className="check">
            <input type="checkbox" name="sells" value="1" defaultChecked={product?.sellsToClient ?? true} />
            Vende ao cliente
          </label>
          <label className="check">
            <input type="checkbox" name="supply" value="1" defaultChecked={product?.isSupply ?? false} />
            Serve de insumo
          </label>
        </div>
        <div className="split">
          <label>
            Preço de venda
            <input name="price" required defaultValue={product ? centsToInput(product.salePriceCents) : ""} placeholder="0,00" />
          </label>
          <label>
            Comissão (%)
            <input name="commission" required inputMode="numeric" defaultValue={product?.commissionPercent ?? 0} />
          </label>
          <label>
            Custo
            <input name="cost" defaultValue={product ? centsToInput(product.costCents) : ""} placeholder="0,00" />
          </label>
          <label>
            Mínimo para avisar
            <input name="min" type="number" min={0} defaultValue={product?.minQty ?? 0} />
          </label>
        </div>
        <p>Zero no mínimo não avisa. A margem é o preço menos o custo.</p>
        <label>
          Preço para o profissional
          <input
            name="staff_price"
            placeholder={product ? centsToInput(staffPriceCents(product.salePriceCents, null, rules.consumption)) : "segue a casa"}
            defaultValue={product?.staffPriceCents != null ? centsToInput(product.staffPriceCents) : ""}
          />
        </label>
        <p>Em branco, o profissional paga {rules.consumption}% do preço de venda. Um valor diferente fica preso neste produto.</p>
        <h2>Fornecedor de costume</h2>
        <label>
          Já cadastrado
          <select name="supplier" defaultValue={product?.supplierId ?? ""}>
            <option value="">Nenhum</option>
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
            Ou cadastre agora
            <input name="supplier_name" placeholder="Nome" />
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
        <h2>Combo</h2>
        <p>Na venda, saem os componentes. O preço e a comissão são os deste produto.</p>
        {components.map((component) => (
          <label className="check" key={component.componentId}>
            <input type="checkbox" name="drop_component" value={component.componentId} />
            Tirar {component.name} · {component.qty}
          </label>
        ))}
        <div className="split">
          <label>
            Componente
            <select name="new_component" defaultValue="">
              <option value="">Não incluir</option>
              {others.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantidade
            <input name="new_component_qty" type="number" min={1} />
          </label>
        </div>
        <SubmitButton label="Salvar produto" />
      </form>
      {product ? (
        <div className="stack">
          <div className="row">
            <Modal label="Compra" title="Compra" tone="teal">
              <form action={moveStock}>
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="reason" value="compra" />
                <p>Entra no estoque e passa a ser o custo.</p>
                <label>
                  Quantidade
                  <input name="qty" type="number" min={1} required />
                </label>
                <label>
                  Custo unitário
                  <input name="unit" required defaultValue={centsToInput(product.costCents)} />
                </label>
                <label>
                  Observação
                  <input name="note" />
                </label>
                <SubmitButton label="Lançar compra" />
              </form>
            </Modal>
            <Modal label="Ajuste" title="Ajuste" tone="amber">
              <form action={moveStock}>
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="reason" value="ajuste" />
                <p>Quantidade negativa tira do estoque.</p>
                <label>
                  Quantidade
                  <input name="qty" type="number" required />
                </label>
                <label>
                  Observação
                  <input name="note" />
                </label>
                <SubmitButton label="Lançar ajuste" />
              </form>
            </Modal>
            <Modal label="Conferência" title="Conferência" tone="rose">
              <form action={moveStock}>
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="reason" value="conferencia" />
                <p>Informe a quantidade contada. A diferença vira o movimento.</p>
                <label>
                  Quantidade contada
                  <input name="qty" type="number" min={0} required />
                </label>
                <label>
                  Observação
                  <input name="note" />
                </label>
                <SubmitButton label="Confirmar contagem" />
              </form>
            </Modal>
          </div>
          <div className="card">
            <h2>Últimos movimentos</h2>
            {movements.length === 0 ? <p>Nenhum movimento ainda.</p> : null}
            {movements.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Motivo</th>
                    <th>Qtd</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement, index) => (
                    <tr key={`${movement.at}-${index}`}>
                      <td>{movement.at}</td>
                      <td>{STOCK_REASONS[movement.reason] ?? movement.reason}</td>
                      <td>{movement.qty > 0 ? `+${movement.qty}` : movement.qty}</td>
                      <td>{movement.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
