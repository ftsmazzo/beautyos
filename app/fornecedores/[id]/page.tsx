import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { formatPhone, formatReais } from "@/catalog/format";
import { listProducts, listPurchases, listSupplierLabels, listSuppliers } from "@/catalog/queries";
import { deleteSupplier, deleteSupplierLabel, saveSupplier, saveSupplierLabel } from "@/catalog/product-actions";
import { ErrorNote, SavedNote } from "@/ui/error-note";
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
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const user = await requireOperator();
  const { id } = await params;
  const query = await searchParams;
  const creating = id === "novo";
  if (!creating && !UUID.test(id)) redirect("/fornecedores");
  const supplier = creating ? null : (await listSuppliers(user.accountId)).find((row) => row.id === id) ?? null;
  if (!creating && !supplier) redirect("/fornecedores");
  const catalog = supplier ? await listProducts(user.accountId) : [];
  const products = supplier ? catalog.filter((product) => product.supplierId === supplier.id) : [];
  const purchases = supplier ? await listPurchases(user.accountId, supplier.id) : [];
  const aliases = supplier ? await listSupplierLabels(user.accountId, supplier.id) : [];

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
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      {supplier ? (
        <div className="desk">
          <div className="desk-bar">
            {supplier.phone ? <span className="chip">{formatPhone(supplier.phone)}</span> : null}
            {supplier.cnpj ? <span className="chip">{supplier.cnpj}</span> : null}
            {supplier.city ? <span className="chip">{supplier.city}</span> : null}
            <span className="chip">{products.length} produtos</span>
            <span className="chip">{aliases.length} nomes na nota</span>
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
          <div className="queue" style={{ overflowX: "auto" }}>
            <div className="queue-head"><h2>Como veio na nota</h2></div>
            {aliases.length === 0 ? <p className="queue-empty">Nenhum nome de nota ainda. Eles nascem ao lançar a compra.</p> : null}
            {aliases.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Na nota</th>
                    <th>Produto</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {aliases.map((alias) => (
                    <tr key={alias.id}>
                      <td>{alias.label}</td>
                      <td>
                        <form action={saveSupplierLabel} className="bos-row">
                          <input type="hidden" name="supplier" value={supplier.id} />
                          <input type="hidden" name="label" value={alias.label} />
                          <select name="product" defaultValue={alias.productId}>
                            {catalog.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </select>
                          <SubmitButton label="Trocar" pendingLabel="…" className="quiet" />
                        </form>
                      </td>
                      <td>
                        <form action={deleteSupplierLabel}>
                          <input type="hidden" name="supplier" value={supplier.id} />
                          <input type="hidden" name="id" value={alias.id} />
                          <SubmitButton label="Tirar" pendingLabel="…" className="quiet" />
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
            <form action={saveSupplierLabel} className="desk-bar" style={{ marginTop: 8 }}>
              <input type="hidden" name="supplier" value={supplier.id} />
              <label>
                Nome na nota
                <input name="label" required minLength={2} />
              </label>
              <label>
                Produto
                <select name="product" required defaultValue="">
                  <option value="" disabled>Escolha</option>
                  {catalog.map((product) => (
                    <option key={product.id} value={product.id}>{product.name}</option>
                  ))}
                </select>
              </label>
              <SubmitButton label="Ligar" pendingLabel="Ligando…" />
            </form>
          </div>
          {purchases.length > 0 ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="queue-head"><h2>Notas</h2></div>
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
                      <td><Link href={`/produtos/compra/${purchase.id}`}>{purchase.document}</Link></td>
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
