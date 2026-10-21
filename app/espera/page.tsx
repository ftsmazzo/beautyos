import Link from "next/link";
import { listOpenWaitlist } from "@/agent/waitlist";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, todaySaoPaulo } from "@/catalog/format";
import { listClients, listServices } from "@/catalog/queries";
import { dayParam, shiftDay } from "@/desk/clock";
import { deskCancelWaitlist, deskEnterWaitlist, deskMarkWaitlistAvisada } from "@/desk/waitlist-actions";
import { db } from "@/db/client";
import { ErrorNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
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
      <div className="desk">
      <ErrorNote code={query.erro} />
      <Saved code={query.ok} />
      <div className="desk-bar">
        <Link className="btn quiet" href={`/espera?dia=${shiftDay(day, -1)}`}>
          ←
        </Link>
        <span className="day-label">{formatDay(day)}</span>
        <Link className="btn quiet" href={`/espera?dia=${shiftDay(day, 1)}`}>
          →
        </Link>
        <Link className="btn quiet" href={`/espera?dia=${today}`}>
          Hoje
        </Link>
        <Link className="btn quiet" href={`/agenda?dia=${day}`}>
          Agenda
        </Link>
        <span className="chip">{rows.length} na fila</span>
        <Modal label="Entrar na espera" title="Espera" tone="blue">
          <form action={deskEnterWaitlist}>
            <input type="hidden" name="day" value={day} />
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
              Profissional
              <select name="professional" defaultValue="">
                <option value="">Qualquer</option>
                {pros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nota
              <input name="note" placeholder="Preferência, horário" />
            </label>
            <SubmitButton label="Entrar" pendingLabel="Salvando…" />
          </form>
        </Modal>
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p className="queue-empty">Ninguém na espera deste dia.</p> : null}
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
      </div>
    </Panel>
  );
}
