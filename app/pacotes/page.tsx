import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais, packageGap } from "@/catalog/format";
import { listPackages } from "@/catalog/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const user = await requireOperator();
  const packages = await listPackages(user.accountId);
  return (
    <Panel user={user} current="/pacotes" title="Pacotes">
      <div className="row">
        <Link className="link" href="/pacotes/novo">
          Novo pacote
        </Link>
      </div>
      <div className="card">
        {packages.length === 0 ? <p>Nenhum pacote ainda.</p> : null}
        {packages.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Serviço</th>
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
