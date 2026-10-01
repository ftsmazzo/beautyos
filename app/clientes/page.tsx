import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatPhone } from "@/catalog/format";
import { channelLabel } from "@/catalog/labels";
import { listClients } from "@/catalog/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const removed = query.estado === "removidos";
  const people = await listClients(user.accountId, removed, query.q ?? "");
  return (
    <Panel user={user} current="/clientes" title="Clientes">
      <div className="row">
        <Link className="btn" href="/clientes/novo">
          Novo cliente
        </Link>
        <Link href={removed ? "/clientes" : "/clientes?estado=removidos"}>{removed ? "Ver ativos" : "Ver removidos"}</Link>
      </div>
      <form className="filters" method="get">
        {removed ? <input type="hidden" name="estado" value="removidos" /> : null}
        <input name="q" defaultValue={query.q ?? ""} placeholder="Nome ou celular" />
        <button type="submit">Buscar</button>
      </form>
      <div className="card">
        {people.length === 0 ? <p>{removed ? "Nenhuma pessoa removida." : "Nenhum cliente ainda."}</p> : null}
        {people.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Celular</th>
                <th>Canal</th>
                <th>Marcas</th>
                <th>Última visita</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>{person.name}</td>
                  <td>{formatPhone(person.phone)}</td>
                  <td>{channelLabel(person.channel)}</td>
                  <td>
                    {[person.fromOutside ? "de fora" : "", person.incomplete ? "incompleto" : ""].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td>sem visita</td>
                  <td>
                    <Link href={`/clientes/${person.id}`}>Abrir</Link>
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
