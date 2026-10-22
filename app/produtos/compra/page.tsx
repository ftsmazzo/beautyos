import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { listProducts, listPurchases, listSupplierLabels, listSuppliers } from "@/catalog/queries";
import { listBanks, listCards, listChart } from "@/finance/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
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
  const cards = await listCards(user.accountId);
  const charts = await listChart(user.accountId);
  const purchases = await listPurchases(user.accountId);
  const aliases = await listSupplierLabels(user.accountId);

  return (
    <Panel user={user} current="/produtos" title="Compra por nota">
      <div className="desk">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <div className="desk-bar">
        <Link className="btn quiet" href="/produtos">
          Produtos
        </Link>
        {products.length > 0 ? (
          <Modal label="Lançar nota" title="Lançar nota" tone="teal">
            <PurchaseForm
              products={products.map((product) => ({ id: product.id, name: product.name, supplierId: product.supplierId }))}
              suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, city: supplier.city }))}
              banks={banks.map((bank) => ({ id: bank.id, name: bank.name }))}
              cards={cards.map((card) => ({ id: card.id, name: card.name }))}
              charts={charts.map((chart) => ({ id: chart.id, code: chart.code, name: chart.name }))}
              aliases={aliases}
              today={todaySaoPaulo()}
            />
          </Modal>
        ) : null}
        <span className="chip">{purchases.length} notas</span>
      </div>
      {products.length === 0 ? <p className="queue-empty">Cadastre um produto antes de lançar a nota.</p> : null}
      <div className="queue" style={{ overflowX: "auto" }}>
        {purchases.length === 0 ? <p className="queue-empty">Nenhuma nota ainda.</p> : null}
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
      </div>
    </Panel>
  );
}
