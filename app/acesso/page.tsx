import Link from "next/link";
import { redirect } from "next/navigation";
import { createAccess } from "@/auth/actions";
import { currentUser } from "@/auth/session";
import { databaseReady, db } from "@/db/client";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  balcao: "Balcão",
  administrador: "Administrador",
  profissional: "Profissional",
  cliente: "Cliente",
};

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (user.role !== "administrador") redirect("/inicio");

  await databaseReady();
  const people = await db()<
    { id: string; name: string; email: string; role: string }[]
  >`
    SELECT id, name, email, role
    FROM users
    WHERE account_id = ${user.accountId}
    ORDER BY name
  `;
  const params = await searchParams;

  return (
    <main>
      <h1>Equipe de acesso</h1>
      <p>Quem entra nesta casa, e com qual papel.</p>
      {params.erro === "email" ? <p className="error">Esse e-mail já existe nesta casa.</p> : null}
      {params.erro === "dados" ? <p className="error">Revise nome, e-mail, senha e papel.</p> : null}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Nome</th>
              <th>E-mail</th>
              <th>Papel</th>
            </tr>
          </thead>
          <tbody>
            {people.map((person) => (
              <tr key={person.id}>
                <td>{person.name}</td>
                <td>{person.email}</td>
                <td>{ROLE_LABEL[person.role] ?? person.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
        <div className="row">
          <button type="submit">Incluir</button>
          <Link className="link" href="/inicio">
            Voltar
          </Link>
        </div>
      </form>
    </main>
  );
}
