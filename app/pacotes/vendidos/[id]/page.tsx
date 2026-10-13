import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, formatReais, packageDeadline, todaySaoPaulo } from "@/catalog/format";
import { soldPackage, soldPackageVisits } from "@/desk/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function SoldPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOperator();
  const { id } = await params;
  const today = todaySaoPaulo();
  const item = await soldPackage(user.accountId, id, today);
  if (!item) redirect("/pacotes/vendidos");
  const visits = await soldPackageVisits(user.accountId, id);
  const deadline = packageDeadline({
    started: item.started,
    validUntil: item.validUntil ? formatDay(item.validUntil) : null,
    expired: item.expired,
    late: item.late,
  });

  return (
    <Panel user={user} current="/pacotes/vendidos" title="Pacote vendido">
      <div className="row">
        <Link className="btn quiet" href="/pacotes/vendidos">
          Pacotes vendidos
        </Link>
        {item.orderId ? (
          <Link className="btn quiet" href={`/comandas/${item.orderId}`}>
            Comanda da venda
          </Link>
        ) : null}
      </div>
      <div className="card">
        <strong>{item.clientName}</strong>
        {item.phone ? <p>{formatPhone(item.phone)}</p> : null}
        <p>
          {item.name} · {item.used} de {item.total} usadas · {formatReais(item.priceCents)}
        </p>
        <p>
          {deadline}
          {item.pardons > 0 ? " · já houve perdão" : ""}
          {item.nextVisit ? ` · próxima ${item.nextVisit}` : ""}
        </p>
      </div>
      <div className="card">
        <h2>Idas</h2>
        {visits.length === 0 ? <p>Nenhuma ida neste pacote.</p> : null}
        {visits.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Quando</th>
                <th>Profissional</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visits.map((visit) => (
                <tr key={visit.id}>
                  <td>{visit.serviceName}</td>
                  <td>
                    {visit.status === "usado" ? "Usada" : visit.when ?? "Falta agendar"}
                    {visit.late ? " · depois do prazo" : ""}
                  </td>
                  <td>{visit.professionalName ?? "—"}</td>
                  <td>
                    {visit.orderId ? <Link href={`/comandas/${visit.orderId}`}>Abrir</Link> : null}
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
