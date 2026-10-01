import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatPhone } from "@/catalog/format";
import { listProfessionals } from "@/catalog/queries";
import { SavedNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function ProfessionalsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const people = await listProfessionals(user.accountId);
  return (
    <Panel user={user} current="/profissionais" title="Profissionais">
      <SavedNote code={query.ok} />
      <div className="row">
        <Link className="btn" href="/profissionais/novo">
          Novo profissional
        </Link>
      </div>
      <div className="card">
        {people.length === 0 ? <p>Nenhum profissional ainda.</p> : null}
        {people.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Celular</th>
                <th>Agenda</th>
                <th>Acesso</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <td>
                    <span className="swatch" style={{ background: person.columnColor }} />
                    {person.nickname || person.name}
                    {person.active ? "" : " · inativo"}
                  </td>
                  <td>{person.phone ? formatPhone(person.phone) : "—"}</td>
                  <td>{person.bookable ? "na agenda" : "fora da agenda"}</td>
                  <td>{person.userId ? "com login" : "sem login"}</td>
                  <td>
                    <Link href={`/profissionais/${person.id}`}>Abrir</Link>
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
