import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais } from "@/catalog/format";
import { listServices } from "@/catalog/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function ServicesPage() {
  const user = await requireOperator();
  const services = await listServices(user.accountId);
  return (
    <Panel user={user} current="/servicos" title="Serviços">
      <div className="row">
        <Link className="btn" href="/servicos/novo">
          Novo serviço
        </Link>
      </div>
      <div className="card">
        {services.length === 0 ? <p>Nenhum serviço ainda.</p> : null}
        {services.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Grupo</th>
                <th>Tempo</th>
                <th>Avulso</th>
                <th>Comissão</th>
                <th>Volta</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id}>
                  <td>
                    {service.name}
                    {service.active ? "" : " · inativo"}
                    {service.bookable ? "" : " · fora da agenda"}
                  </td>
                  <td>{service.menuGroup || "—"}</td>
                  <td>{service.durationMin} min</td>
                  <td>{formatReais(service.priceCents)}</td>
                  <td>{service.commissionPercent}%</td>
                  <td>{service.returnDays == null ? "sem volta" : `${service.returnDays} dias`}</td>
                  <td>
                    <Link href={`/servicos/${service.id}`}>Abrir</Link>
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
