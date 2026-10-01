import { redirect } from "next/navigation";
import { createHouse } from "@/auth/actions";
import { currentUser } from "@/auth/session";
import { databaseReady, db } from "@/db/client";
import { AuthFrame } from "@/ui/auth-frame";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await currentUser();
  if (user) redirect("/inicio");

  await databaseReady();
  const houses = await db()`SELECT id FROM accounts LIMIT 1`;
  if (houses.length > 0) redirect("/entrar");

  const params = await searchParams;
  return (
    <AuthFrame title="Criar a casa" lede="A primeira pessoa entra como administrador. Uma conta é um negócio.">
      {params.erro ? <p className="error">Preencha nome, e-mail e uma senha com pelo menos 8 caracteres.</p> : null}
      <form action={createHouse}>
        <label>
          Nome da casa
          <input name="house" required minLength={2} />
        </label>
        <label>
          Seu nome
          <input name="name" required minLength={2} />
        </label>
        <label>
          E-mail
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Senha
          <input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        <SubmitButton label="Criar e entrar" />
      </form>
    </AuthFrame>
  );
}
