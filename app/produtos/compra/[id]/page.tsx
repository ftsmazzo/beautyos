import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { formatReais } from "@/catalog/format";
import { getPurchase } from "@/catalog/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireOperator();
  const { id } = await params;
  const purchase = await getPurchase(user.accountId, id);
  if (!purchase) notFound();
  const total = purchase.lines.reduce((sum, line) => sum + line.qty * line.costCents, 0);

  return (
    <Panel user={user} current="/produtos" title={purchase.document}>
      <div className="desk">
        <div className="desk-bar">
          <Link className="btn quiet" href="/produtos/compra">Notas</Link>
          <span className="chip">{purchase.supplierName}</span>
          <span className="chip">{purchase.day}</span>
          <span className="chip">{formatReais(total)}</span>
          {purchase.bills.map((bill) => (
            <span key={`${bill.due}-${bill.amountCents}`} className={bill.paid ? "chip" : "chip warn"}>
              {bill.due} · {formatReais(bill.amountCents)}{bill.paid ? " · pago" : ""}
            </span>
          ))}
        </div>
        <div className="queue statement-day" style={{ overflowX: "auto" }}>
          {purchase.lines.length === 0 ? <p className="queue-empty">Esta nota não tem itens.</p> : null}
          {purchase.lines.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Qtd</th>
                  <th className="num">Custo</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchase.lines.map((line) => (
                  <tr key={line.productId}>
                    <td><Link href={`/produtos/${line.productId}`}>{line.name}</Link></td>
                    <td className="num">{line.qty}</td>
                    <td className="num">{formatReais(line.costCents)}</td>
                    <td className="num">{formatReais(line.qty * line.costCents)}</td>
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