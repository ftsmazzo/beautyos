import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais } from "@/catalog/format";
import { listProducts } from "@/catalog/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { StockCount, StockIn, StockOut } from "@/ui/stock-move";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; modo?: string; filtro?: string; q?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const counting = query.modo === "conferencia";
  const onlyMin = query.filtro === "minimo";
  const needle = (query.q ?? "").trim().toLowerCase();
  const products = (await listProducts(user.accountId)).filter((product) => {
    if (onlyMin && !(product.active && product.minQty > 0 && product.balance <= product.minQty)) return false;
    if (!needle) return true;
    const hay = [product.name, product.brand ?? "", product.category ?? "", product.barcode ?? ""].join(" ").toLowerCase();
    return hay.includes(needle);
  });
  function listHref(opts: { modo?: boolean; minimo?: boolean } = {}) {
    const params = new URLSearchParams();
    const useModo = opts.modo ?? counting;
    const useMin = opts.minimo ?? onlyMin;
    if (useModo) params.set("modo", "conferencia");
    if (useMin) params.set("filtro", "minimo");
    if (needle) params.set("q", needle);
    const text = params.toString();
    return text ? `/produtos?${text}` : "/produtos";
  }
  return (
    <Panel user={user} current="/produtos" title="Produtos">
      <div className="desk">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <div className="desk-bar">
        <Link className="btn" href="/produtos/novo">
          Novo produto
        </Link>
        <Link className="btn quiet" href="/fornecedores">
          Fornecedores
        </Link>
        <Link className="btn quiet" href="/produtos/compra">
          Compra
        </Link>
        <Link className="btn quiet" href="/produtos/movimentos">
          Movimentos
        </Link>
        <Link className="btn quiet" href="/relatorios/compras">
          Compras
        </Link>
        <Link className={counting ? "btn" : "btn quiet"} href={listHref({ modo: !counting })}>
          {counting ? "Lista" : "Conferência"}
        </Link>
        <Link className={onlyMin ? "btn" : "btn quiet"} href={listHref({ minimo: !onlyMin })}>
          {onlyMin ? "Todos" : "No mínimo"}
        </Link>
        <form className="filters" method="get" action="/produtos">
          {counting ? <input type="hidden" name="modo" value="conferencia" /> : null}
          {onlyMin ? <input type="hidden" name="filtro" value="minimo" /> : null}
          <input name="q" defaultValue={query.q ?? ""} placeholder="Nome, categoria ou código" />
          <button type="submit">Buscar</button>
        </form>
        <span className="chip">{products.length}</span>
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        {products.length === 0 ? (
          <p className="queue-empty">{onlyMin ? "Nenhum produto no mínimo." : "Nenhum produto ainda."}</p>
        ) : null}
        {products.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Fornecedor</th>
                <th>Saldo</th>
                <th>Venda</th>
                <th>Custo</th>
                <th>Margem</th>
                <th>Uso</th>
                <th>{counting ? "Contagem" : "Movimento"}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const low = product.minQty > 0 && product.balance <= product.minQty;
                const use = [product.sellsToClient ? "vende" : "", product.isSupply ? "insumo" : ""].filter(Boolean).join(" · ");
                return (
                  <tr key={product.id}>
                    <td>
                      {product.name}
                      {product.barcode ? ` · ${product.barcode}` : ""}
                      {product.active ? "" : " · inativo"}
                      {low ? " · no mínimo" : ""}
                    </td>
                    <td>{product.category || "—"}</td>
                    <td>{product.supplierName || "—"}</td>
                    <td className={low ? "warn" : undefined}>{product.balance}</td>
                    <td>{formatReais(product.salePriceCents)}</td>
                    <td>{formatReais(product.costCents)}</td>
                    <td>{formatReais(product.salePriceCents - product.costCents)}</td>
                    <td>{use || "—"}</td>
                    <td>
                      {counting ? (
                        <StockCount productId={product.id} balance={product.balance} />
                      ) : (
                        <div className="row">
                          <Modal label="+" title={`Entrada · ${product.name}`} tone="teal">
                            <StockIn productId={product.id} />
                          </Modal>
                          <Modal label="−" title={`Saída · ${product.name}`} tone="amber">
                            <StockOut productId={product.id} />
                          </Modal>
                        </div>
                      )}
                    </td>
                    <td>
                      <Link href={`/produtos/${product.id}`}>Abrir</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
      </div>
    </Panel>
  );
}
