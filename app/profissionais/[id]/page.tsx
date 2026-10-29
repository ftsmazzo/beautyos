import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { centsToInput, formatDay, formatPhone, formatReais } from "@/catalog/format";
import { WEEKDAYS } from "@/catalog/labels";
import { getProfessional, listHours, listProServices, listServices, loginOptions } from "@/catalog/queries";
import { deleteProfessional, saveProfessional } from "@/catalog/professional-actions";
import { setAccessActive, setAccessPassword } from "@/auth/actions";
import { db } from "@/db/client";
import { ErrorNote } from "@/ui/error-note";
import { HoursGrid } from "@/ui/hours-grid";
import { RosterShortcut } from "@/ui/roster-shortcut";
import { StandardField } from "@/ui/standard-field";
import { Modal } from "@/ui/modal";
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

function hourLabel(values: Record<string, { start: string; end: string }>, day: number, period: number) {
  const slot = values[`${day}-${period}`];
  return slot?.start && slot.end ? `${slot.start}–${slot.end}` : "—";
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
  const does = visible.filter((service) => linked.has(service.id));
  const fixedHours = hourValues(hours, false);
  const periodHours = hourValues(hours, true);
  const override = hours.find((row) => row.validFrom);
  const used = person
    ? await db()`
        SELECT 1 FROM order_lines WHERE account_id = ${user.accountId} AND (professional_id = ${person.id} OR referrer_professional_id = ${person.id})
        UNION ALL
        SELECT 1 FROM appointments WHERE account_id = ${user.accountId} AND professional_id = ${person.id}
        UNION ALL
        SELECT 1 FROM orders WHERE account_id = ${user.accountId} AND professional_id = ${person.id}
        LIMIT 1
      `
    : [];
  const linkedLogin = person?.userId
    ? (
        await db()<{ email: string; role: string; active: boolean }[]>`
          SELECT email, role, active FROM users WHERE id = ${person.userId} AND account_id = ${user.accountId}
        `
      )[0] ?? null
    : null;

  const editor = (
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
        <div className="bos-row">
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
        {user.role === "administrador" && !person?.userId ? (
          <>
            <h2>Criar login</h2>
            <div className="split">
              <label>
                E-mail do acesso
                <input name="login_email" type="email" autoComplete="off" />
              </label>
              <label>
                Senha inicial
                <input name="login_password" type="password" minLength={8} autoComplete="new-password" />
              </label>
            </div>
          </>
        ) : null}
        <h2>Serviços</h2>
        <RosterShortcut checkName="does" />
        {visible.length === 0 ? <p className="queue-empty">Nenhum serviço na casa.</p> : null}
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
                      <StandardField
                        name={`price_${service.id}`}
                        mode="reais"
                        label={`Preço de ${service.name}`}
                        standard={centsToInput(service.priceCents)}
                        stored={link?.priceCents != null ? centsToInput(link.priceCents) : ""}
                      />
                    </td>
                    <td>
                      <StandardField
                        name={`duration_${service.id}`}
                        mode="int"
                        label={`Tempo de ${service.name}`}
                        standard={String(service.durationMin)}
                        stored={link?.durationMin != null ? String(link.durationMin) : ""}
                      />
                    </td>
                    <td>
                      <StandardField
                        name={`commission_${service.id}`}
                        mode="int"
                        label={`Comissão de ${service.name}`}
                        standard={String(service.commissionPercent)}
                        stored={link?.commissionPercent != null ? String(link.commissionPercent) : ""}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        <h2>Horário fixo</h2>
        <HoursGrid prefix="f" values={hourValues(hours, false)} />
        <h2>Horário por período</h2>
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
  );

  return (
    <Panel user={user} current="/profissionais" title={person ? person.name : "Novo profissional"}>
      <ErrorNote code={query.erro} />
      {person ? (
        <div className="desk">
          <div className="desk-bar">
            {person.nickname ? <span className="badge bg-secondary-lt">{person.nickname}</span> : null}
            {person.phone ? <span className="badge bg-secondary-lt">{formatPhone(person.phone)}</span> : null}
            {person.active ? null : <span className="badge bg-secondary-lt">inativo</span>}
            {person.bookable ? null : <span className="badge bg-secondary-lt">Fora da agenda</span>}
            <Modal label="Editar" title={`Editar · ${person.name}`} tone="navy">
              {editor}
            </Modal>
            {user.role === "administrador" && person.userId && linkedLogin ? (
              <>
                <span className="badge bg-secondary-lt">{linkedLogin.email}</span>
                <span className="badge bg-secondary-lt">{linkedLogin.active ? "login ativo" : "login desativado"}</span>
                <Modal label="Trocar senha" title={`Senha · ${person.name}`} tone="navy">
                  <form action={setAccessPassword}>
                    <input type="hidden" name="id" value={person.userId} />
                    <input type="hidden" name="back" value="ficha" />
                    <input type="hidden" name="professional" value={person.id} />
                    <label>
                      Nova senha
                      <input name="password" type="password" required minLength={8} autoComplete="new-password" />
                    </label>
                    <SubmitButton label="Trocar senha" pendingLabel="Trocando…" />
                  </form>
                </Modal>
                {person.userId === user.id ? <span className="badge bg-secondary-lt">Seu acesso</span> : (
                  <form action={setAccessActive}>
                    <input type="hidden" name="id" value={person.userId} />
                    <input type="hidden" name="back" value="ficha" />
                    <input type="hidden" name="professional" value={person.id} />
                    <input type="hidden" name="active" value={linkedLogin.active ? "0" : "1"} />
                    <SubmitButton
                      label={linkedLogin.active ? "Desativar login" : "Reativar login"}
                      pendingLabel="Salvando…"
                      className="btn btn-outline"
                    />
                  </form>
                )}
              </>
            ) : null}
            {used.length === 0 ? (
              <form action={deleteProfessional}>
                <input type="hidden" name="id" value={person.id} />
                <SubmitButton label="Excluir" pendingLabel="Excluindo…" className="btn btn-outline" />
              </form>
            ) : null}
          </div>
          <div className="queue" style={{ overflowX: "auto" }}>
            {does.length === 0 ? <p className="queue-empty">Nenhum serviço.</p> : null}
            {does.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Preço</th>
                    <th>Tempo</th>
                    <th>Comissão</th>
                  </tr>
                </thead>
                <tbody>
                  {does.map((service) => {
                    const link = linked.get(service.id);
                    return (
                      <tr key={service.id}>
                        <td>{service.name}</td>
                        <td>{formatReais(link?.priceCents ?? service.priceCents)}</td>
                        <td>{link?.durationMin ?? service.durationMin} min</td>
                        <td>{link?.commissionPercent ?? service.commissionPercent}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
          {Object.keys(fixedHours).length > 0 ? (
          <div className="queue" style={{ overflowX: "auto" }}>
            <div className="desk-bar"><span className="day-label">Horário fixo</span></div>
            {(
              <table>
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Primeiro</th>
                    <th>Segundo</th>
                  </tr>
                </thead>
                <tbody>
                  {WEEKDAYS.map((label, day) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{hourLabel(fixedHours, day, 1)}</td>
                      <td>{hourLabel(fixedHours, day, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          ) : null}
          {override && Object.keys(periodHours).length > 0 ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="desk-bar">
                <span className="day-label">
                  Horário{override.validFrom && override.validUntil ? ` ${formatDay(override.validFrom)}–${formatDay(override.validUntil)}` : " por período"}
                </span>
              </div>
              {Object.keys(periodHours).length === 0 ? <p className="queue-empty">Sem horário neste período.</p> : (
                <table>
                  <thead>
                    <tr>
                      <th>Dia</th>
                      <th>Primeiro</th>
                      <th>Segundo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {WEEKDAYS.map((label, day) => (
                      <tr key={`o-${label}`}>
                        <td>{label}</td>
                        <td>{hourLabel(periodHours, day, 1)}</td>
                        <td>{hourLabel(periodHours, day, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        editor
      )}
    </Panel>
  );
}
