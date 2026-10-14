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
  searchParams: Promise<{ ok?: string; erro?: string; modo?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const counting = query.modo === "conferencia";
  const products = await listProducts(user.accountId);
  return (
    <Panel user={user} current="/produtos" title="Produtos">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <div className="row">
        <Link className="btn" href="/produtos/novo">
          Novo produto
        </Link>
        <Link className="btn quiet" href="/produtos/compra">
          Compra por nota
        </Link>
        <Link className="btn quiet" href={counting ? "/produtos" : "/produtos?modo=conferencia"}>
          {counting ? "Voltar à lista" : "Conferência"}
        </Link>
      </div>
      {counting ? <p>Conte cada produto. A diferença entra no estoque quando você confirma, com a data e quem contou.</p> : null}
      <div className="card">
        {products.length === 0 ? <p>Nenhum produto ainda.</p> : null}
        {products.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Saldo</th>
                <th>Venda</th>
                <th>Custo</th>
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
                      {product.active ? "" : " · inativo"}
                      {low ? " · no mínimo" : ""}
                    </td>
                    <td className={low ? "warn" : undefined}>{product.balance}</td>
                    <td>{formatReais(product.salePriceCents)}</td>
                    <td>{formatReais(product.costCents)}</td>
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
    </Panel>
  );
}
