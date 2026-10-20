import Link from "next/link";
import {
  linkAgentConversation,
  saveAgentChannel,
  simulateAgentMessage,
  startSimulatorConversation,
} from "@/agent/actions";
import { agentPanelData } from "@/agent/queries";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone } from "@/catalog/format";
import { ErrorNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

function AgentSaved({ code }: { code?: string }) {
  if (code === "agente") return <p className="ok banner">Mensagem enviada ao agente.</p>;
  if (code === "vinculo") return <p className="ok banner">Conversa vinculada ao cliente.</p>;
  if (code === "canal") return <p className="ok banner">Canal do agente salvo.</p>;
  return null;
}

export default async function AgentePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; ok?: string; erro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const data = await agentPanelData(user.accountId, query.c);
  const selected = data.conversations.find((row) => row.id === data.selectedId) ?? null;
  const isAdmin = user.role === "administrador";

  return (
    <Panel user={user} current="/agente" title="Agente">
      <ErrorNote code={query.erro} />
      <AgentSaved code={query.ok} />
      <p>
        Conversas do cliente com o agente da casa. Use o simulador para testar agenda, pacote e espera. O webhook WhatsApp fica stub
        até haver credenciais.
      </p>

      <div className="row">
        <form action={startSimulatorConversation} className="row">
          <label>
            Nova conversa (celular)
            <input name="phone" inputMode="tel" placeholder="11999999999" required />
          </label>
          <SubmitButton label="Abrir" pendingLabel="Abrindo…" />
        </form>
      </div>

      <div className="split" style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) 1fr", gap: 16, alignItems: "start" }}>
        <div className="card stack">
          <strong>Conversas</strong>
          {data.conversations.length === 0 ? <p>Nenhuma conversa ainda.</p> : null}
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
            {data.conversations.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/agente?c=${row.id}`}
                  aria-current={row.id === data.selectedId ? "page" : undefined}
                  style={{
                    display: "block",
                    padding: "10px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--line)",
                    background: row.id === data.selectedId ? "#eef4ff" : "var(--card)",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <strong>{row.label}</strong>
                  <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{row.phoneLabel}</div>
                  <div style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 4 }}>
                    {row.lastMessageAt} · {(row.preview ?? "—").slice(0, 60)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="stack">
          <div className="card stack">
            <strong>{selected ? selected.label : "Thread"}</strong>
            {!selected ? <p>Abra ou inicie uma conversa para simular.</p> : null}
            {selected ? (
              <>
                <div style={{ display: "grid", gap: 10, maxHeight: 420, overflow: "auto" }}>
                  {data.messages.length === 0 ? <p>Sem mensagens. Envie a primeira abaixo.</p> : null}
                  {data.messages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        justifySelf: message.direction === "in" ? "start" : message.direction === "out" ? "end" : "stretch",
                        maxWidth: "85%",
                        padding: "10px 12px",
                        borderRadius: 8,
                        background:
                          message.direction === "in" ? "#f3f4f6" : message.direction === "out" ? "#dbeafe" : "#fef9c3",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 4 }}>
                        {message.direction === "in" ? "Cliente" : message.direction === "out" ? "Agente" : "Sistema"} ·{" "}
                        {message.createdAt}
                      </div>
                      {message.body}
                    </div>
                  ))}
                </div>
                <form action={simulateAgentMessage} className="stack">
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <input type="hidden" name="externalKey" value={selected.externalKey} />
                  <label>
                    Simular mensagem do cliente
                    <textarea name="text" rows={3} required placeholder="Ex.: meus horários" />
                  </label>
                  <SubmitButton label="Enviar ao agente" pendingLabel="Pensando…" />
                </form>
                <form action={linkAgentConversation} className="row">
                  <input type="hidden" name="conversationId" value={selected.id} />
                  <label>
                    Vincular cliente
                    <select name="clientId" required defaultValue={selected.clientId ?? ""}>
                      <option value="" disabled>
                        Escolha…
                      </option>
                      {data.clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name} · {formatPhone(client.phone)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SubmitButton label="Vincular" pendingLabel="Salvando…" />
                </form>
              </>
            ) : null}
          </div>

          <div className="card stack">
            <strong>Espera (fila da IA)</strong>
            {data.waitlist.length === 0 ? <p>Nenhuma espera aberta.</p> : null}
            {data.waitlist.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Cliente</th>
                    <th>Serviço</th>
                    <th>Profissional</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {data.waitlist.map((row) => (
                    <tr key={row.id}>
                      <td>{formatDay(row.day)}</td>
                      <td>
                        {row.clientName}
                        <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{formatPhone(row.phone)}</div>
                      </td>
                      <td>{row.serviceName}</td>
                      <td>{row.professionalName ?? "—"}</td>
                      <td>{row.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>

          {isAdmin ? (
            <div className="card stack">
              <strong>Canal</strong>
              <p style={{ color: "var(--muted)", margin: 0 }}>
                Token do webhook: <code>{data.channel.webhookToken}</code>
              </p>
              <p style={{ color: "var(--muted)", margin: 0 }}>
                POST <code>/api/agent/whatsapp?token=…</code> com JSON <code>{`{ "from", "text" }`}</code>
              </p>
              <form action={saveAgentChannel} className="stack">
                <label>
                  Provedor
                  <select name="provider" defaultValue={data.channel.provider}>
                    <option value="simulador">Simulador</option>
                    <option value="whatsapp_cloud">WhatsApp Cloud (stub)</option>
                  </select>
                </label>
                <label>
                  Telefone do canal
                  <input name="phone" defaultValue={data.channel.phoneE164 ?? ""} placeholder="+5511…" />
                </label>
                <label className="row">
                  <input type="checkbox" name="active" value="1" defaultChecked={data.channel.active} />
                  Canal ativo
                </label>
                <label className="row">
                  <input type="checkbox" name="rotateToken" value="1" />
                  Gerar novo token
                </label>
                <SubmitButton label="Salvar canal" pendingLabel="Salvando…" />
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
