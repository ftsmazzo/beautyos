import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { formatPhone } from "@/catalog/format";
import { CHANNELS } from "@/catalog/labels";
import { getClient, houseRules, listClients, listProfessionals } from "@/catalog/queries";
import { saveClient } from "@/catalog/client-actions";
import { ErrorNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ClientFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireOperator();
  const { id } = await params;
  const query = await searchParams;
  const creating = id === "novo";
  if (!creating && !UUID.test(id)) redirect("/clientes");
  const person = creating ? null : await getClient(user.accountId, id);
  if (!creating && !person) redirect("/clientes");
  const [rules, professionals, clients] = await Promise.all([
    houseRules(user.accountId),
    listProfessionals(user.accountId),
    listClients(user.accountId, false, ""),
  ]);

  return (
    <Panel user={user} current="/clientes" title={person ? person.name : "Novo cliente"}>
      <ErrorNote code={query.erro} />
      <form action={saveClient}>
        {person ? <input type="hidden" name="id" value={person.id} /> : null}
        <div className="split">
          <label>
            Nome
            <input name="name" required minLength={2} defaultValue={person?.name ?? ""} />
          </label>
          <label>
            Celular
            <input name="phone" required defaultValue={person ? formatPhone(person.phone) : ""} />
          </label>
        </div>
        <div className="split">
          <label>
            E-mail
            <input name="email" type="email" defaultValue={person?.email ?? ""} />
          </label>
          <label>
            Nascimento
            <input name="birth" type="date" defaultValue={person?.birthDate ?? ""} />
          </label>
        </div>
        <label>
          Observação
          <textarea name="notes" defaultValue={person?.notes ?? ""} />
        </label>
        <label>
          Canal de chegada
          <select name="channel" defaultValue={person?.channel ?? "nao_informado"}>
            {CHANNELS.map((channel) => (
              <option key={channel.value} value={channel.value}>
                {channel.label}
              </option>
            ))}
          </select>
        </label>
        <div className="row">
          <label className="check">
            <input type="checkbox" name="from_outside" value="1" defaultChecked={person?.fromOutside ?? false} />
            De fora. Fica fora da análise de volta.
          </label>
          <label className="check">
            <input type="checkbox" name="incomplete" value="1" defaultChecked={person?.incomplete ?? false} />
            Cadastro incompleto
          </label>
          <label className="check">
            <input type="checkbox" name="active" value="1" defaultChecked={person?.active ?? true} />
            Ativo
          </label>
        </div>
        <h2>Indicação</h2>
        <p>Vale quando o canal é indicação. A comissão é de quem trouxe, por cima de quem executou. Em branco usa {rules.referral}% da casa.</p>
        <div className="split">
          <label>
            Profissional que indicou
            <select name="referrer_professional" defaultValue={person?.referrerProfessionalId ?? ""}>
              <option value="">Ninguém</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>
                  {professional.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cliente que indicou
            <select name="referrer_client" defaultValue={person?.referrerClientId ?? ""}>
              <option value="">Ninguém</option>
              {clients
                .filter((client) => client.id !== person?.id)
                .map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Comissão desta indicação (%)
            <input
              name="referral_commission"
              inputMode="numeric"
              placeholder={String(rules.referral)}
              defaultValue={person?.referralCommissionPercent ?? ""}
            />
          </label>
        </div>
        <details>
          <summary>Documento e endereço</summary>
          <div className="split">
            <label>
              Telefone fixo
              <input name="landline" defaultValue={person?.landline ?? ""} />
            </label>
            <label>
              CPF
              <input name="cpf" defaultValue={person?.cpf ?? ""} />
            </label>
            <label>
              RG
              <input name="rg" defaultValue={person?.rg ?? ""} />
            </label>
            <label>
              Sexo
              <input name="sex" defaultValue={person?.sex ?? ""} />
            </label>
          </div>
          <label>
            Endereço
            <textarea name="address" defaultValue={person?.address ?? ""} />
          </label>
        </details>
        <div className="card">
          <h2>Resumo</h2>
          <p>Última visita, volta por serviço, pacotes, pontos e conta do cliente entram com a agenda e a comanda.</p>
        </div>
        <SubmitButton label="Salvar cliente" />
      </form>
    </Panel>
  );
}
