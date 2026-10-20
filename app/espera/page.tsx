import Link from "next/link";
import { listOpenWaitlist } from "@/agent/waitlist";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, todaySaoPaulo } from "@/catalog/format";
import { listClients, listServices } from "@/catalog/queries";
import { dayParam, shiftDay } from "@/desk/clock";
import { deskCancelWaitlist, deskEnterWaitlist, deskMarkWaitlistAvisada } from "@/desk/waitlist-actions";
import { db } from "@/db/client";
import { ErrorNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

function Saved({ code }: { code?: string }) {
  if (code === "espera") return <p className="ok banner">Entrou na espera.</p>;
  if (code === "aviso") return <p className="ok banner">Marcado como avisado — ligue ou mande Zap.</p>;
  if (code === "saiu") return <p className="ok banner">Saiu da espera.</p>;
  return null;
}

export default async function EsperaPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; ok?: string; erro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const day = dayParam(query.dia);
  const today = todaySaoPaulo();
  const rows = await listOpenWaitlist(user.accountId, day);
  const clients = await listClients(user.accountId, false, "");
  const services = (await listServices(user.accountId)).filter((s) => s.active && s.bookable);
  const pros = await db()<{ id: string; name: string }[]>`
    SELECT id, COALESCE(NULLIF(nickname, ''), name) AS name
    FROM professionals
    WHERE account_id = ${user.accountId} AND active
    ORDER BY name
  `;

  return (
    <Panel user={user} current="/espera" title="Espera">
      <ErrorNote code={query.erro} />
      <Saved code={query.ok} />
      <p>
        Fila da IA e do balcão: cliente, serviço, profissional e dia. Quando um horário cancela, a espera do dia vira{" "}
        <strong>avisada</strong> para a casa ligar. Passou o dia, some sozinha.
      </p>

      <div className="row">
        <Link className="btn quiet" href={`/espera?dia=${shiftDay(day, -1)}`}>
          Dia anterior
        </Link>
        <strong>{formatDay(day)}</strong>
        <Link className="btn quiet" href={`/espera?dia=${shiftDay(day, 1)}`}>
          Próximo dia
        </Link>
        <Link className="btn quiet" href={`/espera?dia=${today}`}>
          Hoje
        </Link>
        <Link className="btn quiet" href="/agenda">
          Agenda
        </Link>
      </div>

      <form action={deskEnterWaitlist} className="card stack">
        <strong>Colocar na espera</strong>
        <input type="hidden" name="day" value={day} />
        <div className="row">
          <label>
            Cliente
            <select name="client" required defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {formatPhone(c.phone)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Serviço
            <select name="service" required defaultValue="">
              <option value="" disabled>
                Escolha…
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Profissional (opcional)
            <select name="professional" defaultValue="">
              <option value="">Qualquer</option>
              {pros.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Nota
          <input name="note" placeholder="Preferência, horário, etc." />
        </label>
        <SubmitButton label="Entrar na espera" pendingLabel="Salvando…" />
      </form>

      <div className="card">
        {rows.length === 0 ? <p>Ninguém na espera deste dia.</p> : null}
        {rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Serviço</th>
                <th>Profissional</th>
                <th>Status</th>
                <th>Nota</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.clientName}
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {formatPhone(row.phone)}
                    </div>
                  </td>
                  <td>{row.serviceName}</td>
                  <td>{row.professionalName ?? "Qualquer"}</td>
                  <td>{row.status === "avisada" ? "Avisada" : "Aberta"}</td>
                  <td>{row.note ?? "—"}</td>
                  <td>
                    <div className="row">
                      {row.status === "aberta" ? (
                        <form action={deskMarkWaitlistAvisada}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="day" value={day} />
                          <SubmitButton label="Marcar avisada" pendingLabel="…" className="quiet" />
                        </form>
                      ) : null}
                      <form action={deskCancelWaitlist}>
                        <input type="hidden" name="id" value={row.id} />
                        <input type="hidden" name="day" value={day} />
                        <SubmitButton label="Sair" pendingLabel="…" className="quiet" />
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
