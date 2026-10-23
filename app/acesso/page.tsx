import Link from "next/link";
import { redirect } from "next/navigation";
import { createAccess, setAccessActive, setAccessClient, setAccessPassword, setAccessRole } from "@/auth/actions";
import { currentUser } from "@/auth/session";
import { saveHouseModules } from "@/catalog/house-actions";
import { formatPhone } from "@/catalog/format";
import { HOUSE_MODULES } from "@/catalog/modules";
import { houseModules, listClients } from "@/catalog/queries";
import { databaseReady, db } from "@/db/client";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const ROLES = [
  { value: "balcao", label: "Balcão" },
  { value: "administrador", label: "Administrador" },
  { value: "profissional", label: "Profissional" },
  { value: "cliente", label: "Cliente" },
] as const;

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (user.role !== "administrador") redirect("/inicio");

  await databaseReady();
  const modules = await houseModules(user.accountId);
  const people = await db()<
    {
      id: string;
      name: string;
      email: string;
      role: string;
      active: boolean;
      professionalId: string | null;
      professionalName: string | null;
      clientId: string | null;
      clientName: string | null;
    }[]
  >`
    SELECT u.id, u.name, u.email, u.role, u.active,
           p.id AS "professionalId", p.name AS "professionalName",
           u.client_id AS "clientId", c.name AS "clientName"
    FROM users u
    LEFT JOIN professionals p ON p.user_id = u.id AND p.account_id = u.account_id
    LEFT JOIN clients c ON c.id = u.client_id AND c.account_id = u.account_id
    WHERE u.account_id = ${user.accountId}
    ORDER BY u.name
  `;
  const clients = await listClients(user.accountId, false, "");
  const params = await searchParams;

  return (
    <Panel user={user} current="/acesso" title="Equipe de acesso">
      <div className="desk">
      {params.erro === "email" ? <p className="error">Esse e-mail já existe nesta casa.</p> : null}
      {params.erro === "dados" ? <p className="error">Revise nome, e-mail, senha e papel.</p> : null}
      {params.erro === "proprio" ? <p className="error">Você não desativa o próprio acesso.</p> : null}
      {params.erro === "ultimo" ? <p className="error">A casa precisa de um administrador ativo.</p> : null}
      {params.ok === "modulos" ? <p className="ok">Módulos salvos.</p> : null}
      <div className="desk-bar">
        <Modal label="Incluir acesso" title="Incluir acesso" tone="teal">
          <form action={createAccess}>
            <label>
              Nome
              <input name="name" required minLength={2} />
            </label>
            <label>
              E-mail
              <input name="email" type="email" required />
            </label>
            <label>
              Senha inicial
              <input name="password" type="password" required minLength={8} />
            </label>
            <label>
              Papel
              <select name="role" defaultValue="balcao">
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton label="Incluir" />
          </form>
        </Modal>
        <span className="chip">{people.length}</span>
      </div>
      <details className="desk-secondary">
        <summary>Módulos</summary>
        <form action={saveHouseModules}>
          {HOUSE_MODULES.map((item) => (
            <label className="check" key={item.id}>
              <input type="checkbox" name={item.id} value="1" defaultChecked={modules[item.id]} />
              {item.label}
            </label>
          ))}
          <SubmitButton label="Salvar módulos" pendingLabel="Salvando…" />
        </form>
      </details>
      <div className="queue" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Papel</th>
              <th>Vínculo</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td>
                  <strong>{person.name}</strong>
                  <div>{person.email}</div>
                </td>
                <td>
                  {ROLES.find((role) => role.value === person.role)?.label ?? person.role}
                  {" "}
                  <span className="chip">{person.active ? "ativo" : "desativado"}</span>
                </td>
                <td>
                  {person.professionalId ? (
                    <Link href={`/profissionais/${person.professionalId}`}>{person.professionalName}</Link>
                  ) : person.clientName ? (
                    person.clientName
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <div className="row">
                    <Modal label="Ajustar" title={`Ajustar · ${person.name}`} tone="navy">
                      <form action={setAccessRole}>
                        <input type="hidden" name="id" value={person.id} />
                        <label>
                          Papel
                          <select name="role" defaultValue={person.role} aria-label={`Papel de ${person.name}`}>
                            {ROLES.map((role) => (
                              <option key={role.value} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <SubmitButton label="Salvar papel" pendingLabel="Salvando…" />
                      </form>
                      <form action={setAccessPassword}>
                        <input type="hidden" name="id" value={person.id} />
                        <label>
                          Nova senha
                          <input name="password" type="password" required minLength={8} autoComplete="new-password" aria-label={`Senha de ${person.name}`} />
                        </label>
                        <SubmitButton label="Trocar senha" pendingLabel="Trocando…" />
                      </form>
                      {person.role === "cliente" ? (
                        <form action={setAccessClient}>
                          <input type="hidden" name="id" value={person.id} />
                          <label>
                            Ficha
                            <select name="client" defaultValue={person.clientId ?? ""} aria-label={`Ficha de ${person.name}`}>
                              <option value="">Sem vínculo</option>
                              {clients.map((client) => (
                                <option key={client.id} value={client.id}>
                                  {client.name} · {formatPhone(client.phone)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <SubmitButton label="Vincular" pendingLabel="Salvando…" />
                        </form>
                      ) : null}
                    </Modal>
                    {person.id === user.id ? (
                      <span className="chip">Você</span>
                    ) : (
                      <form action={setAccessActive}>
                        <input type="hidden" name="id" value={person.id} />
                        <input type="hidden" name="active" value={person.active ? "0" : "1"} />
                        <SubmitButton
                          label={person.active ? "Desativar" : "Reativar"}
                          pendingLabel="Salvando…"
                          className="quiet"
                        />
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </Panel>
  );
}
