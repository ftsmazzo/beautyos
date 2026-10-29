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
        <p className="queue-empty">Este login ainda não está ligado à ficha. O balcão vincula em Acesso.</p>
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
      <div className="desk">
      <div className="desk-bar">
        <span className="day-label">{client?.name ?? user.name}</span>
        {client?.phone ? <span className="badge bg-secondary-lt">{formatPhone(client.phone)}</span> : null}
        <span className="badge bg-secondary-lt">{user.accountName}</span>
        <Link className="btn btn-outline" href="/inicio">Início</Link>
      </div>
      {appointments.length === 0 && packages.length === 0 && history.length === 0 ? (
        <p className="queue-empty">Nada marcado ainda.</p>
      ) : null}
      {appointments.length > 0 ? (
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="desk-bar"><span className="day-label">Horários</span></div>
        {appointments.length > 0 ? (
          <table>
            <tbody>
              {appointments.map((row) => (
                <tr key={row.id}>
                  <td>{formatDay(row.day)} {row.start}–{row.end}</td>
                  <td>{row.serviceName}</td>
                  <td>{row.professionalName}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      ) : null}
      {packages.length > 0 ? (
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="desk-bar"><span className="day-label">Pacotes</span></div>
        {packages.length > 0 ? (
          <table>
            <tbody>
              {packages.map((row) => {
                const left = row.total - row.used;
                return (
                  <tr key={row.id}>
                    <td>{row.name}</td>
                    <td>{left} de {row.total}</td>
                    <td>
                      {row.validUntil
                        ? row.started
                          ? formatDay(row.validUntil)
                          : "prazo na 1ª ida"
                        : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
      ) : null}
      {history.length > 0 ? (
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="desk-bar"><span className="day-label">Histórico</span></div>
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
      ) : null}
      </div>
    </Panel>
  );
}
