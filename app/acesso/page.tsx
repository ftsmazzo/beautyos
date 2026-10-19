import Link from "next/link";
import { redirect } from "next/navigation";
import { createAccess, setAccessActive, setAccessPassword, setAccessRole } from "@/auth/actions";
import { currentUser } from "@/auth/session";
import { saveHouseModules } from "@/catalog/house-actions";
import { HOUSE_MODULES } from "@/catalog/modules";
import { houseModules } from "@/catalog/queries";
import { databaseReady, db } from "@/db/client";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

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
    { id: string; name: string; email: string; role: string; active: boolean; professionalId: string | null; professionalName: string | null }[]
  >`
    SELECT u.id, u.name, u.email, u.role, u.active,
           p.id AS "professionalId", p.name AS "professionalName"
    FROM users u
    LEFT JOIN professionals p ON p.user_id = u.id AND p.account_id = u.account_id
    WHERE u.account_id = ${user.accountId}
    ORDER BY u.name
  `;
  const params = await searchParams;

  return (
    <Panel user={user} current="/acesso" title="Equipe de acesso">
      <p>Quem entra nesta casa, e com qual papel. Desativar tira o acesso e as sessões. A ficha do profissional continua.</p>
      {params.erro === "email" ? <p className="error">Esse e-mail já existe nesta casa.</p> : null}
      {params.erro === "dados" ? <p className="error">Revise nome, e-mail, senha e papel.</p> : null}
      {params.erro === "proprio" ? <p className="error">Você não desativa o próprio acesso.</p> : null}
      {params.erro === "ultimo" ? <p className="error">A casa precisa de um administrador ativo.</p> : null}
      {params.ok === "modulos" ? <p className="ok">Módulos salvos. O que ficou desligado sai do menu e da rota.</p> : null}
      <form action={saveHouseModules} className="card">
        <h2>Módulos</h2>
        <p>Início, agenda, comandas, serviços, profissionais, clientes e acesso ficam sempre ligados. O resto a casa liga ou desliga.</p>
        {HOUSE_MODULES.map((item) => (
          <label className="check" key={item.id}>
            <input type="checkbox" name={item.id} value="1" defaultChecked={modules[item.id]} />
            {item.label}
          </label>
        ))}
        <SubmitButton label="Salvar módulos" pendingLabel="Salvando…" />
      </form>
      {people.map((person) => (
        <div className="card" key={person.id}>
          <p>
            <strong>{person.name}</strong>
            {` · ${person.email} · ${person.active ? "ativo" : "desativado"}`}
          </p>
          <p>
            {person.professionalId ? (
              <>
                Ficha · <Link href={`/profissionais/${person.professionalId}`}>{person.professionalName}</Link>
              </>
            ) : (
              "Sem ficha de profissional."
            )}
          </p>
          <form action={setAccessRole} className="row">
            <input type="hidden" name="id" value={person.id} />
            <label>
              Papel
              <select name="role" defaultValue={person.role}>
                <option value="balcao">Balcão</option>
                <option value="administrador">Administrador</option>
                <option value="profissional">Profissional</option>
                <option value="cliente">Cliente</option>
              </select>
            </label>
            <SubmitButton label="Salvar papel" pendingLabel="Salvando…" />
          </form>
          <form action={setAccessPassword} className="row">
            <input type="hidden" name="id" value={person.id} />
            <label>
              Nova senha
              <input name="password" type="password" required minLength={8} autoComplete="new-password" />
            </label>
            <SubmitButton label="Trocar senha" pendingLabel="Trocando…" className="quiet" />
          </form>
          {person.id === user.id ? <p>Este é o seu acesso.</p> : (
            <form action={setAccessActive}>
              <input type="hidden" name="id" value={person.id} />
              <input type="hidden" name="active" value={person.active ? "0" : "1"} />
              <SubmitButton
                label={person.active ? "Desativar login" : "Reativar login"}
                pendingLabel="Salvando…"
                className="quiet"
              />
            </form>
          )}
        </div>
      ))}
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
            <option value="balcao">Balcão</option>
            <option value="administrador">Administrador</option>
            <option value="profissional">Profissional</option>
            <option value="cliente">Cliente</option>
          </select>
        </label>
        <SubmitButton label="Incluir" />
      </form>
    </Panel>
  );
}
