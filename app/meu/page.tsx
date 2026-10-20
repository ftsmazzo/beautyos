import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/session";
import { formatDay, formatPhone, formatReais, todaySaoPaulo } from "@/catalog/format";
import { clientActivePackages, clientUpcomingAppointments } from "@/desk/booking";
import { db } from "@/db/client";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

export default async function MeuPortalPage() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (user.role !== "cliente") redirect("/inicio");
  if (!user.clientId) {
    return (
      <Panel user={user} current="/meu" title="Minha conta">
        <div className="card">
          <p>Este login ainda não está ligado à sua ficha. Peça ao balcão para vincular em Acesso.</p>
        </div>
      </Panel>
    );
  }

  const today = todaySaoPaulo();
  const [client] = await db()<{ name: string; phone: string }[]>`
    SELECT name, phone FROM clients
    WHERE id = ${user.clientId} AND account_id = ${user.accountId}
  `;
  const appointments = await clientUpcomingAppointments(user.accountId, user.clientId);
  const packages = await clientActivePackages(user.accountId, user.clientId, today);
  const history = await db()<
    { day: string; serviceName: string; professionalName: string; priceCents: number }[]
  >`
    SELECT to_char(o.day, 'YYYY-MM-DD') AS day,
           COALESCE(l.description, 'Serviço') AS "serviceName",
           COALESCE(NULLIF(p.nickname, ''), p.name, '—') AS "professionalName",
           l.price_cents AS "priceCents"
    FROM orders o
    JOIN order_lines l ON l.order_id = o.id AND l.kind = 'servico'
    LEFT JOIN professionals p ON p.id = l.professional_id
    WHERE o.account_id = ${user.accountId}
      AND o.client_id = ${user.clientId}
      AND o.status = 'fechada'
    ORDER BY o.day DESC, l.created_at DESC
    LIMIT 30
  `;

  return (
    <Panel user={user} current="/meu" title="Minha conta">
      <p>
        {client?.name ?? user.name}
        {client?.phone ? ` · ${formatPhone(client.phone)}` : ""} · {user.accountName}
      </p>

      <div className="card stack">
        <strong>Próximos horários</strong>
        {appointments.length === 0 ? <p className="muted">Nenhum horário marcado.</p> : null}
        {appointments.map((row) => (
          <div key={row.id}>
            <strong>
              {formatDay(row.day)} {row.start}–{row.end}
            </strong>
            <div className="muted">
              {row.serviceName} · {row.professionalName} · {row.status}
            </div>
          </div>
        ))}
        <p className="muted" style={{ margin: 0 }}>
          Para remarcar ou cancelar, fale no WhatsApp da casa ou no balcão.
        </p>
      </div>

      <div className="card stack">
        <strong>Pacotes e créditos</strong>
        {packages.length === 0 ? <p className="muted">Nenhum pacote ativo.</p> : null}
        {packages.map((row) => {
          const left = row.total - row.used;
          return (
            <div key={row.id}>
              <strong>{row.name}</strong>
              <div className="muted">
                {left} de {row.total} créditos
                {row.validUntil
                  ? row.started
                    ? ` · válido até ${formatDay(row.validUntil)}`
                    : ` · prazo começa na 1ª ida`
                  : ""}
              </div>
            </div>
          );
        })}
      </div>

      <div className="card stack">
        <strong>Histórico recente</strong>
        {history.length === 0 ? <p className="muted">Nenhuma visita fechada ainda.</p> : null}
        {history.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Serviço</th>
                <th>Profissional</th>
                <th>Valor</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row, index) => (
                <tr key={`${row.day}-${row.serviceName}-${index}`}>
                  <td>{formatDay(row.day)}</td>
                  <td>{row.serviceName}</td>
                  <td>{row.professionalName}</td>
                  <td>{formatReais(row.priceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <p className="muted">
        <Link href="/inicio">Início</Link>
      </p>
    </Panel>
  );
}
