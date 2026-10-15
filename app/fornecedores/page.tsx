import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatPhone } from "@/catalog/format";
import { listSuppliers } from "@/catalog/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const suppliers = await listSuppliers(user.accountId);

  return (
    <Panel user={user} current="/fornecedores" title="Fornecedores">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <div className="row">
        <Link className="btn" href="/fornecedores/novo">
          Novo fornecedor
        </Link>
        <Link className="btn quiet" href="/produtos">
          Produtos
        </Link>
        <Link className="btn quiet" href="/produtos/compra">
          Compra por nota
        </Link>
      </div>
      <div className="card">
        {suppliers.length === 0 ? <p>Nenhum fornecedor ainda.</p> : null}
        {suppliers.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Telefone</th>
                <th>CNPJ</th>
                <th>Cidade</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id}>
                  <td>{supplier.name}</td>
                  <td>{supplier.phone ? formatPhone(supplier.phone) : "—"}</td>
                  <td>{supplier.cnpj || "—"}</td>
                  <td>{supplier.city || "—"}</td>
                  <td>
                    <Link href={`/fornecedores/${supplier.id}`}>Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
