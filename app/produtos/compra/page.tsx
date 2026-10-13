import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { listProducts, listPurchases, listSuppliers } from "@/catalog/queries";
import { listBanks } from "@/finance/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";
import { PurchaseForm } from "@/ui/purchase-form";

export const dynamic = "force-dynamic";

export default async function PurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const products = (await listProducts(user.accountId)).filter((product) => product.active);
  const suppliers = await listSuppliers(user.accountId);
  const banks = await listBanks(user.accountId);
  const purchases = await listPurchases(user.accountId);

  return (
    <Panel user={user} current="/produtos" title="Compra por nota">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <div className="row">
        <Link className="btn quiet" href="/produtos">
          Produtos
        </Link>
      </div>
      {products.length === 0 ? <p>Cadastre um produto antes de lançar a nota.</p> : null}
      {products.length > 0 ? (
        <>
          <p>Sem o papel na mão, a nota entra aqui. O mesmo número, no mesmo fornecedor, não entra de novo.</p>
          <PurchaseForm
            products={products.map((product) => ({ id: product.id, name: product.name }))}
            suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, city: supplier.city }))}
            banks={banks.map((bank) => ({ id: bank.id, name: bank.name }))}
            today={todaySaoPaulo()}
          />
        </>
      ) : null}
      <div className="card">
        <h2>Notas lançadas</h2>
        {purchases.length === 0 ? <p>Nenhuma nota ainda.</p> : null}
        {purchases.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Fornecedor</th>
                <th>Nota</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td>{purchase.day}</td>
                  <td>{purchase.supplierName}</td>
                  <td>{purchase.document}</td>
                  <td>{formatReais(purchase.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
