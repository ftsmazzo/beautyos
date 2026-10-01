import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { centsToInput } from "@/catalog/format";
import { getProfessional, listHours, listProServices, listServices, loginOptions } from "@/catalog/queries";
import { saveProfessional } from "@/catalog/professional-actions";
import { ErrorNote } from "@/ui/error-note";
import { HoursGrid } from "@/ui/hours-grid";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function hourValues(rows: { weekday: number; period: number; startTime: string; endTime: string; validFrom: string | null }[], override: boolean) {
  const values: Record<string, { start: string; end: string }> = {};
  for (const row of rows) {
    if (Boolean(row.validFrom) !== override) continue;
    values[`${row.weekday}-${row.period}`] = { start: row.startTime.slice(0, 5), end: row.endTime.slice(0, 5) };
  }
  return values;
}

export default async function ProfessionalFormPage({
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
  if (!creating && !UUID.test(id)) redirect("/profissionais");
  const person = creating ? null : await getProfessional(user.accountId, id);
  if (!creating && !person) redirect("/profissionais");
  const [services, links, hours, logins] = await Promise.all([
    listServices(user.accountId),
    person ? listProServices(person.id) : Promise.resolve([]),
    person ? listHours(person.id) : Promise.resolve([]),
    loginOptions(user.accountId, person?.userId ?? null),
  ]);
  const linked = new Map(links.map((link) => [link.serviceId, link]));
  const visible = services.filter((service) => service.active || linked.has(service.id));
  const override = hours.find((row) => row.validFrom);

  return (
    <Panel user={user} current="/profissionais" title={person ? person.name : "Novo profissional"}>
      <ErrorNote code={query.erro} />
      <form action={saveProfessional}>
        {person ? <input type="hidden" name="id" value={person.id} /> : null}
        <div className="split">
          <label>
            Nome
            <input name="name" required minLength={2} defaultValue={person?.name ?? ""} />
          </label>
          <label>
            Apelido
            <input name="nickname" defaultValue={person?.nickname ?? ""} />
          </label>
        </div>
        <div className="split">
          <label>
            Celular
            <input name="phone" defaultValue={person?.phone ?? ""} />
          </label>
          <label>
            E-mail
            <input name="email" type="email" defaultValue={person?.email ?? ""} />
          </label>
          <label>
            Nascimento
            <input name="birth" type="date" defaultValue={person?.birthDate ?? ""} />
          </label>
          <label>
            Cor da coluna
            <input name="color" type="color" defaultValue={person?.columnColor ?? "#1f6f78"} />
          </label>
        </div>
        <label>
          Observação
          <textarea name="notes" defaultValue={person?.notes ?? ""} />
        </label>
        <div className="row">
          <label className="check">
            <input type="checkbox" name="active" value="1" defaultChecked={person?.active ?? true} />
            Ativo
          </label>
          <label className="check">
            <input type="checkbox" name="bookable" value="1" defaultChecked={person?.bookable ?? true} />
            Entra na agenda
          </label>
        </div>
        <label>
          Login
          <select name="login" defaultValue={person?.userId ?? ""}>
            <option value="">Sem login</option>
            {logins.map((login) => (
              <option key={login.id} value={login.id}>
                {login.name} · {login.email}
              </option>
            ))}
          </select>
        </label>
        <p>O acesso de profissional nasce em Acesso. Aqui só se liga a ficha.</p>
        <h2>Serviços</h2>
        <p>Célula vazia segue o padrão do serviço. Limpar volta ao padrão. No pacote, o preço interno manda e esta comissão continua.</p>
        {visible.length === 0 ? <p>Cadastre um serviço para montar esta tabela.</p> : null}
        {visible.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Faz</th>
                <th>Serviço</th>
                <th>Preço</th>
                <th>Tempo</th>
                <th>Comissão</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((service) => {
                const link = linked.get(service.id);
                return (
                  <tr key={service.id}>
                    <td>
                      <input type="checkbox" name="does" value={service.id} defaultChecked={Boolean(link)} />
                    </td>
                    <td>{service.name}</td>
                    <td>
                      <input
                        name={`price_${service.id}`}
                        placeholder={centsToInput(service.priceCents)}
                        defaultValue={link?.priceCents != null ? centsToInput(link.priceCents) : ""}
                      />
                    </td>
                    <td>
                      <input
                        name={`duration_${service.id}`}
                        inputMode="numeric"
                        placeholder={String(service.durationMin)}
                        defaultValue={link?.durationMin ?? ""}
                      />
                    </td>
                    <td>
                      <input
                        name={`commission_${service.id}`}
                        inputMode="numeric"
                        placeholder={String(service.commissionPercent)}
                        defaultValue={link?.commissionPercent ?? ""}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        <h2>Horário fixo</h2>
        <p>O intervalo entre os dois períodos é o almoço. Fora deles a coluna fica fechada.</p>
        <HoursGrid prefix="f" values={hourValues(hours, false)} />
        <h2>Horário por período</h2>
        <p>Vale só entre as datas. O horário fixo continua guardado.</p>
        <div className="split">
          <label>
            De
            <input name="override_from" type="date" defaultValue={override?.validFrom ?? ""} />
          </label>
          <label>
            Até
            <input name="override_until" type="date" defaultValue={override?.validUntil ?? ""} />
          </label>
        </div>
        <HoursGrid prefix="o" values={hourValues(hours, true)} />
        <SubmitButton label="Salvar profissional" />
      </form>
    </Panel>
  );
}
