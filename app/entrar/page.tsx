import { login } from "@/auth/actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const params = await searchParams;
  return (
    <main>
      <h1>Entrar</h1>
      <p>Use o e-mail da sua casa.</p>
      {params.erro ? <p className="error">E-mail ou senha não conferem.</p> : null}
      <form action={login}>
        <label>
          E-mail
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Senha
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
        <button type="submit">Entrar</button>
      </form>
    </main>
  );
}
