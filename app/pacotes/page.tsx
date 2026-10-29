import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais, packageGap } from "@/catalog/format";
import { togglePackageSale } from "@/catalog/package-actions";
import { listPackages } from "@/catalog/queries";
import { SavedNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const packages = await listPackages(user.accountId);
  return (
    <Panel user={user} current="/pacotes" title="Pacotes">
      <div className="desk">
      <SavedNote code={query.ok} />
      <div className="desk-bar">
        <Link className="btn btn-primary" href="/pacotes/novo">
          Novo pacote
        </Link>
        <Link className="btn btn-outline" href="/pacotes/vendidos">
          Vendidos
        </Link>
        <span className="badge bg-secondary-lt">{packages.length}</span>
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        {packages.length === 0 ? <p className="queue-empty">Nenhum pacote ainda.</p> : null}
        {packages.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Serviços</th>
                <th>Idas</th>
                <th>Preço</th>
                <th>Diferença</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {packages.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.name}
                    {item.forSale ? "" : " · fora de venda"}
                  </td>
                  <td>{item.serviceName || "—"}</td>
                  <td>{item.visits}</td>
                  <td>{formatReais(item.priceCents)}</td>
                  <td>{packageGap(item.avulsoCents, item.internalCents)}</td>
                  <td>
                    <Link href={`/pacotes/${item.id}`}>Abrir</Link>
                    <form action={togglePackageSale}>
                      <input type="hidden" name="id" value={item.id} />
                      <SubmitButton
                        label={item.forSale ? "Tirar de venda" : "Colocar à venda"}
                        pendingLabel="Salvando…"
                        className="btn btn-outline"
                      />
                    </form>
                  </td>
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
