import Link from "next/link";
import { redirect } from "next/navigation";
import { logout } from "@/auth/actions";
import { currentUser } from "@/auth/session";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  balcao: "Balcão",
  administrador: "Administrador",
  profissional: "Profissional",
  cliente: "Cliente",
};

export default async function StartPage() {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  return (
    <main>
      <h1>{user.accountName}</h1>
      <p>
        {user.name} · {ROLE_LABEL[user.role] ?? user.role}
      </p>
      <div className="card">
        <p>A casa está aberta. Agenda e comanda entram na fase seguinte.</p>
        <div className="row">
          {user.role === "administrador" ? (
            <Link className="link" href="/acesso">
              Equipe de acesso
            </Link>
          ) : null}
          <form action={logout}>
            <button type="submit">Sair</button>
          </form>
        </div>
      </div>
    </main>
  );
}
