import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais } from "@/catalog/format";
import { listProducts } from "@/catalog/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const user = await requireOperator();
  const products = await listProducts(user.accountId);
  return (
    <Panel user={user} current="/produtos" title="Produtos">
      <div className="row">
        <Link className="link" href="/produtos/novo">
          Novo produto
        </Link>
      </div>
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
