import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatReais } from "@/catalog/format";
import { listServices, openPriceNotices } from "@/catalog/queries";
import { PriceNotice } from "@/ui/price-notice";
import { SavedNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const services = await listServices(user.accountId);
  const notices = await openPriceNotices(user.accountId);
  return (
    <Panel user={user} current="/servicos" title="Serviços">
      <div className="desk">
      <SavedNote code={query.ok} />
      <PriceNotice notices={notices} back="servicos" />
      <div className="desk-bar">
        <Link className="btn btn-primary" href="/servicos/novo">
          Novo serviço
        </Link>
        <Link className="btn btn-outline" href="/servicos/periodo">
          Venda, uso e avulso
        </Link>
        <span className="badge bg-secondary-lt">{services.length}</span>
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        {services.length === 0 ? <p className="queue-empty">Nenhum serviço ainda.</p> : null}
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
                <th>Quem faz</th>
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
                  <td>{service.performers || "—"}</td>
                  <td>
                    <Link href={`/servicos/${service.id}`}>Abrir</Link>
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
