import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatPhone } from "@/catalog/format";
import { listProfessionals } from "@/catalog/queries";
import { SavedNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

function PersonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19c1.4-3.2 3.8-4.8 7-4.8s5.6 1.6 7 4.8" />
    </svg>
  );
}

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
      <div className="desk">
        <SavedNote code={query.ok} />
        <div className="desk-bar">
          <Link className="btn btn-primary" href="/profissionais/novo">
            Novo profissional
          </Link>
          <span className="badge bg-blue-lt text-blue">{people.length}</span>
        </div>
        <div className="card">
          <div className="table-responsive">
            {people.length === 0 ? <p className="text-secondary p-3 mb-0">Nenhum profissional ainda.</p> : null}
            {people.length > 0 ? (
              <table className="table table-vcenter card-table table-hover">
                <thead>
                  <tr>
                    <th>Profissional</th>
                    <th>Celular</th>
                    <th>Agenda</th>
                    <th>Acesso</th>
                    <th className="w-1" />
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <div className="d-flex align-items-center py-1">
                          <span
                            className="avatar avatar-sm me-2"
                            style={{
                              background: person.columnColor || "#206bc4",
                              color: "#fff",
                            }}
                            title={person.columnColor || "cor da coluna"}
                          >
                            <PersonIcon />
                          </span>
                          <div>
                            <div className="fw-medium">{person.nickname || person.name}</div>
                            {person.nickname && person.nickname !== person.name ? (
                              <div className="text-secondary small">{person.name}</div>
                            ) : null}
                            {!person.active ? <div className="text-secondary small">inativo</div> : null}
                          </div>
                        </div>
                      </td>
                      <td>{person.phone ? formatPhone(person.phone) : "—"}</td>
                      <td>
                        {person.bookable ? (
                          <span className="badge bg-green-lt text-green">na agenda</span>
                        ) : (
                          <span className="badge bg-secondary-lt text-secondary">fora</span>
                        )}
                      </td>
                      <td>{person.userId ? "com login" : "sem login"}</td>
                      <td>
                        <Link className="btn btn-sm btn-outline" href={`/profissionais/${person.id}`}>
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}
