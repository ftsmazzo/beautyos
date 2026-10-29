import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { daysAbsent, formatPhone, todaySaoPaulo } from "@/catalog/format";
import { channelLabel } from "@/catalog/labels";
import { listClients } from "@/catalog/queries";
import { SavedNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; ok?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const removed = query.estado === "removidos";
  const people = await listClients(user.accountId, removed, query.q ?? "");
  const today = todaySaoPaulo();
  return (
    <Panel user={user} current="/clientes" title="Clientes">
      <div className="desk">
      <SavedNote code={query.ok} />
      <div className="desk-bar">
        <Link className="btn btn-primary" href="/clientes/novo">
          Novo cliente
        </Link>
        <Link className="btn btn-outline" href="/clientes/origem">
          Origem
        </Link>
        <Link className="btn btn-outline" href={removed ? "/clientes" : "/clientes?estado=removidos"}>
          {removed ? "Ativos" : "Removidos"}
        </Link>
        <form className="desk-bar" method="get" style={{ margin: 0, flex: "1 1 220px" }}>
          {removed ? <input type="hidden" name="estado" value="removidos" /> : null}
          <input name="q" defaultValue={query.q ?? ""} placeholder="Nome ou celular" aria-label="Busca" />
          <button className="btn btn-outline" type="submit">
            Buscar
          </button>
        </form>
        <span className="badge bg-secondary-lt">{people.length}</span>
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        {people.length === 0 ? <p className="queue-empty">{removed ? "Nenhuma pessoa removida." : "Nenhum cliente ainda."}</p> : null}
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
                  <td>{daysAbsent(person.lastVisit, today)}</td>
                  <td>
                    <Link href={`/clientes/${person.id}`}>Abrir</Link>
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
