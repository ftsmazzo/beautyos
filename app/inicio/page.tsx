import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/session";
import { saveHouseRules } from "@/catalog/house-actions";
import { applyDuePrices, catalogCounts, houseRules } from "@/catalog/queries";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  balcao: "Balcão",
  administrador: "Administrador",
  profissional: "Profissional",
  cliente: "Cliente",
};

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const params = await searchParams;
  const operator = user.role === "administrador" || user.role === "balcao";
  if (operator) await applyDuePrices(user.accountId);
  const counts = operator ? await catalogCounts(user.accountId) : null;
  const rules = user.role === "administrador" ? await houseRules(user.accountId) : null;

  return (
    <Panel user={user} current="/inicio" title="Início">
      <p>
        {user.name} · {ROLE_LABEL[user.role] ?? user.role}
      </p>
      {params.ok === "regras" ? <p className="ok">Regras salvas.</p> : null}
      {params.erro === "dados" ? <p className="error">Informe os dois percentuais, de 0 a 100.</p> : null}
      {operator && counts ? (
        <div className="card">
          <p>As fichas já podem ser preenchidas. Agenda e comanda vêm em seguida.</p>
          <div className="row">
            <Link href="/servicos">{counts.services} serviços</Link>
            <Link href="/profissionais">{counts.professionals} profissionais</Link>
            <Link href="/clientes">{counts.clients} clientes</Link>
            <Link href="/produtos">{counts.products} produtos</Link>
            <Link href="/pacotes">{counts.packages} pacotes</Link>
          </div>
        </div>
      ) : (
        <div className="card">
          <p>Sua agenda entra na fase seguinte.</p>
        </div>
      )}
      {rules ? (
        <form action={saveHouseRules}>
          <h2>Regras da casa</h2>
          <label>
            Comissão de quem indicou (%)
            <input name="referral" type="number" min={0} max={100} required defaultValue={rules.referral} />
          </label>
          <p>Vale por cima de quem executou. Cada cliente pode ter um número diferente.</p>
          <label>
            Consumo do profissional (% do preço de venda)
            <input name="consumption" type="number" min={0} max={100} required defaultValue={rules.consumption} />
          </label>
          <p>O preço de consumo de cada produto segue este percentual, até alguém gravar um valor próprio.</p>
          <SubmitButton label="Salvar regras" />
        </form>
      ) : null}
    </Panel>
  );
}
