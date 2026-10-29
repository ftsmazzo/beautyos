import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, todaySaoPaulo } from "@/catalog/format";
import { dayParam, shiftDay } from "@/desk/clock";
import { cancelReminder, markReminderDone } from "@/desk/reminder-actions";
import { listReminders } from "@/desk/reminders";
import { ErrorNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

function Saved({ code }: { code?: string }) {
  if (code === "feito") return <p className="ok banner">Lembrete marcado como feito.</p>;
  if (code === "cancela") return <p className="ok banner">Lembrete cancelado.</p>;
  return null;
}

export default async function LembretesPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; ok?: string; erro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const day = dayParam(query.dia);
  const today = todaySaoPaulo();
  const rows = await listReminders(user.accountId, day);

  return (
    <Panel user={user} current="/lembretes" title="Lembretes">
      <div className="desk">
      <ErrorNote code={query.erro} />
      <Saved code={query.ok} />
      <div className="desk-bar">
        <Link className="btn btn-outline" href={`/lembretes?dia=${shiftDay(day, -1)}`}>
          ←
        </Link>
        <span className="day-label">{formatDay(day)}</span>
        <Link className="btn btn-outline" href={`/lembretes?dia=${shiftDay(day, 1)}`}>
          →
        </Link>
        <Link className="btn btn-outline" href={`/lembretes?dia=${today}`}>
          Hoje
        </Link>
        <Link className="btn btn-outline" href="/aniversariantes">
          Aniversariantes
        </Link>
        <span className="badge bg-secondary-lt">{rows.length}</span>
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        {rows.length === 0 ? <p className="queue-empty">Nenhum lembrete neste dia.</p> : null}
        {rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Dia</th>
                <th>Texto</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.kind === "aniversario" ? "Aniversário" : "Agendamento"}</td>
                  <td>{formatDay(row.day)}</td>
                  <td>{row.body}</td>
                  <td>
                    {row.status === "pendente" ? "Pendente" : row.status === "feito" ? "Feito" : "Cancelado"}
                  </td>
                  <td>
                    {row.status === "pendente" ? (
                      <div className="bos-row">
                        <form action={markReminderDone}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="day" value={day} />
                          <SubmitButton label="Feito" pendingLabel="…" />
                        </form>
                        <form action={cancelReminder}>
                          <input type="hidden" name="id" value={row.id} />
                          <input type="hidden" name="day" value={day} />
                          <SubmitButton label="Cancelar" pendingLabel="…" className="btn btn-outline" />
                        </form>
                      </div>
                    ) : null}
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
