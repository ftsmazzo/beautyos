import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { listSuppliers } from "@/catalog/queries";
import { deleteSupplier, saveSupplier } from "@/catalog/product-actions";
import { ErrorNote } from "@/ui/error-note";
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

  return (
    <Panel user={user} current="/fornecedores" title={supplier ? supplier.name : "Novo fornecedor"}>
      <ErrorNote code={query.erro} />
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
      {supplier ? (
        <form action={deleteSupplier}>
          <input type="hidden" name="id" value={supplier.id} />
          <p>Excluir só vale se este fornecedor ainda não entrou numa compra nem num produto.</p>
          <SubmitButton label="Excluir" pendingLabel="Excluindo…" className="rose" />
        </form>
      ) : null}
    </Panel>
  );
}
