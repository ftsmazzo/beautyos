import { login } from "@/auth/actions";
import { AuthFrame } from "@/ui/auth-frame";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthFrame title="Entrar" lede="Use o e-mail da sua casa.">
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
        <SubmitButton label="Entrar" />
      </form>
    </AuthFrame>
  );
}
