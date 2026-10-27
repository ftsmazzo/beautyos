import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { restockDraft } from "@/catalog/invoice";
import { listProducts, listPurchases, listSupplierLabels, listSuppliers } from "@/catalog/queries";
import { listBanks, listCards, listChart } from "@/finance/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";
import { PurchaseLaunch } from "@/ui/purchase-launch";

export const dynamic = "force-dynamic";

export default async function PurchasePage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string; pedir?: string; fornecedor?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const today = todaySaoPaulo();
  const catalog = await listProducts(user.accountId);
  const products = catalog.filter((product) => product.active);
  const suppliers = await listSuppliers(user.accountId);
  const banks = await listBanks(user.accountId);
  const cards = await listCards(user.accountId);
  const charts = await listChart(user.accountId);
  const purchases = await listPurchases(user.accountId);
  const aliases = await listSupplierLabels(user.accountId);
  const lowCount = products.filter(
    (product) => product.minQty > 0 && product.balance < product.minQty,
  ).length;
  const asking = query.pedir === "1";
  const seed = asking
    ? restockDraft(
        products,
        suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, cnpj: supplier.cnpj })),
        today,
        query.fornecedor,
      )
    : null;
  const leftOut = asking && seed
    ? lowCount - seed.lines.length
    : 0;
  const seedNote = seed
    ? `${seed.lines.length} no mínimo${seed.supplierName ? ` · ${seed.supplierName}` : ""}${leftOut > 0 ? ` · ${leftOut} de outro fornecedor fora` : ""}. Número da lista já veio preenchido.`
    : asking
      ? "Nenhum produto abaixo do mínimo."
      : "";

  return (
    <Panel user={user} current="/produtos" title="Compra por nota">
      <div className="desk">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      {asking && !seed ? <p className="desk-alert">{seedNote}</p> : null}
      <PurchaseLaunch
        purchaseCount={purchases.length}
        products={products.map((product) => ({ id: product.id, name: product.name, supplierId: product.supplierId }))}
        suppliers={suppliers.map((supplier) => ({ id: supplier.id, name: supplier.name, city: supplier.city }))}
        banks={banks.map((bank) => ({ id: bank.id, name: bank.name }))}
        cards={cards.map((card) => ({ id: card.id, name: card.name }))}
        charts={charts.map((chart) => ({ id: chart.id, code: chart.code, name: chart.name }))}
        aliases={aliases}
        today={today}
        seed={seed}
        seedNote={seed ? seedNote : undefined}
        lowCount={lowCount}
      />
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
                  <td><Link href={`/produtos/compra/${purchase.id}`}>{purchase.document}</Link></td>
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
