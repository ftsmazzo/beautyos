import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { formatPhone, formatReais } from "@/catalog/format";
import { listProducts, listPurchases, listSuppliers } from "@/catalog/queries";
import { deleteSupplier, saveSupplier } from "@/catalog/product-actions";
import { ErrorNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function SupplierFormPage({
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
  if (!creating && !UUID.test(id)) redirect("/fornecedores");
  const supplier = creating ? null : (await listSuppliers(user.accountId)).find((row) => row.id === id) ?? null;
  if (!creating && !supplier) redirect("/fornecedores");
  const products = supplier
    ? (await listProducts(user.accountId)).filter((product) => product.supplierId === supplier.id)
    : [];
  const purchases = supplier ? await listPurchases(user.accountId, supplier.id) : [];

  const editor = (
    <form action={saveSupplier}>
      {supplier ? <input type="hidden" name="id" value={supplier.id} /> : null}
      <label>
        Nome
        <input name="name" required minLength={2} defaultValue={supplier?.name ?? ""} />
      </label>
      <div className="split">
        <label>
          Telefone
          <input name="phone" defaultValue={supplier?.phone ?? ""} />
        </label>
        <label>
          CNPJ
          <input name="cnpj" defaultValue={supplier?.cnpj ?? ""} />
        </label>
        <label>
          Cidade
          <input name="city" defaultValue={supplier?.city ?? ""} />
        </label>
      </div>
      <SubmitButton label="Salvar" pendingLabel="Salvando…" />
    </form>
  );

  return (
    <Panel user={user} current="/fornecedores" title={supplier ? supplier.name : "Novo fornecedor"}>
      <ErrorNote code={query.erro} />
      {supplier ? (
        <div className="desk">
          <div className="desk-bar">
            {supplier.phone ? <span className="chip">{formatPhone(supplier.phone)}</span> : null}
            {supplier.cnpj ? <span className="chip">{supplier.cnpj}</span> : null}
            {supplier.city ? <span className="chip">{supplier.city}</span> : null}
            <span className="chip">{products.length} produtos</span>
            <Modal label="Editar" title={`Editar · ${supplier.name}`} tone="navy">
              {editor}
            </Modal>
            <Link className="btn quiet" href="/produtos/compra">
              Compra
            </Link>
            <form action={deleteSupplier}>
              <input type="hidden" name="id" value={supplier.id} />
              <SubmitButton label="Excluir" pendingLabel="Excluindo…" className="quiet" />
            </form>
          </div>
          <div className="queue" style={{ overflowX: "auto" }}>
            {products.length === 0 ? <p className="queue-empty">Nenhum produto deste fornecedor.</p> : null}
            {products.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th>Saldo</th>
                    <th>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <Link href={`/produtos/${product.id}`}>{product.name}</Link>
                        {!product.active ? " · inativo" : ""}
                      </td>
                      <td>
                        {product.balance}
                        {product.minQty > 0 && product.balance <= product.minQty ? " · baixo" : ""}
                      </td>
                      <td>{formatReais(product.costCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
          {purchases.length > 0 ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Nota</th>
                    <th>Data</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((purchase) => (
                    <tr key={purchase.id}>
                      <td>{purchase.document}</td>
                      <td>{purchase.day}</td>
                      <td>{formatReais(purchase.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : (
        editor
      )}
    </Panel>
  );
}
