import Link from "next/link";
import {
  clearAgentInbox,
  linkAgentConversation,
  returnToAi,
  sendHumanReply,
  simulateAgentMessage,
  startSimulatorConversation,
  takeHumanHandoff,
} from "@/agent/actions";
import { agentInboxData, type ConversationFilter } from "@/agent/queries";
import { requireOperator } from "@/catalog/access";
import { formatPhone } from "@/catalog/format";
import { ErrorNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

function Saved({ code }: { code?: string }) {
  const map: Record<string, string> = {
    agente: "Resposta do agente registrada.",
    vinculo: "Conversa vinculada ao cliente.",
    humano: "Atendimento humano.",
    ia: "Agente voltou a atender.",
    limpa: "Inbox limpa.",
  };
  if (!code || !map[code]) return null;
  return <p className="ok banner">{map[code]}</p>;
}

export default async function ConversasAgentePage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; filter?: string; ok?: string; erro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const filter: ConversationFilter =
    query.filter === "ai" || query.filter === "human" ? query.filter : "todas";
  const data = await agentInboxData(user.accountId, user.accountName, {
    conversationId: query.c,
    filter,
  });
  const waOk = data.evolution.status === "connected";
  const isAdmin = user.role === "administrador";

  return (
    <Panel user={user} current="/agente" title="Conversas">
      <ErrorNote code={query.erro} />
      <Saved code={query.ok} />

      <div className="desk">
      <div className="desk-bar">
        <span className="day-label">{data.channel.displayName}</span>
        <span className={`agent-pill ${waOk ? "ok" : "mute"}`}>
          {waOk ? "WhatsApp" : "WhatsApp off"}
        </span>
        <Link className="btn quiet" href="/agente/config">
          Configurar
        </Link>
        {data.waitlistCount > 0 ? (
          <Link className="btn quiet" href="/agente/config#espera">
            Espera · {data.waitlistCount}
          </Link>
        ) : null}
        <div className="agent-filters">
          <Link className={filter === "todas" ? "is-on" : undefined} href="/agente">
            Todas
          </Link>
          <Link className={filter === "ai" ? "is-on" : undefined} href="/agente?filter=ai">
            IA
          </Link>
          <Link className={filter === "human" ? "is-on" : undefined} href="/agente?filter=human">
            Humano
          </Link>
        </div>
        <span className="chip">{data.conversations.length}</span>
        {isAdmin ? (
          <form action={clearAgentInbox}>
            <SubmitButton label="Limpar" pendingLabel="Limpando…" className="quiet" />
          </form>
        ) : null}
      </div>

      <div className={`agent-inbox${data.selected ? " has-thread" : ""}`}>
        <div className="queue" style={{ overflowX: "auto" }}>
          <table className="agent-table">
            <thead>
              <tr>
                <th>Contato</th>
                <th>Cliente</th>
                <th>Modo</th>
                <th>Última</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {data.conversations.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <p className="queue-empty">Nenhuma conversa.</p>
                  </td>
                </tr>
              ) : (
                data.conversations.map((row) => (
                  <tr key={row.id} className={row.id === data.selectedId ? "is-selected" : undefined}>
                    <td>
                      <Link href={`/agente?c=${row.id}${filter !== "todas" ? `&filter=${filter}` : ""}`}>
                        {row.phoneLabel}
                      </Link>
                    </td>
                    <td>{row.clientName ?? "—"}</td>
                    <td>
                      <span className={`agent-pill ${row.mode === "human" ? "warn" : "mute"}`}>
                        {row.mode === "human" ? "Humano" : "IA"}
                      </span>
                    </td>
                    <td>{row.lastMessageAt}</td>
                    <td className="agent-preview">{(row.preview ?? "—").slice(0, 72)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data.selected ? (
          <div className="queue stack agent-thread">
            <div className="agent-card-head">
              <div>
                <strong>{data.selected.label}</strong>
                <div className="muted" style={{ fontSize: "0.9rem" }}>
                  {data.selected.phoneLabel}
                </div>
              </div>
              <Link className="btn quiet" href={filter === "todas" ? "/agente" : `/agente?filter=${filter}`}>
                Fechar
              </Link>
            </div>

            <div className="agent-messages">
              {data.messages.length === 0 ? <p className="muted">Sem mensagens.</p> : null}
              {data.messages.map((message) => (
                <div
                  key={message.id}
                  className={`agent-bubble ${message.direction === "in" ? "in" : message.direction === "out" ? "out" : "sys"}`}
                >
                  <div className="agent-bubble-meta">
                    {message.direction === "in" ? "Cliente" : message.direction === "out" ? "Casa" : "Sistema"} ·{" "}
                    {message.createdAt}
                  </div>
                  {message.body}
                </div>
              ))}
            </div>

            <form action={sendHumanReply} className="stack">
              <input type="hidden" name="conversationId" value={data.selected.id} />
              <label>
                Responder como balcão
                <textarea name="text" rows={2} required placeholder="Mensagem para o WhatsApp…" />
              </label>
              <SubmitButton label="Enviar" pendingLabel="Enviando…" />
            </form>
            <div className="row">
              {data.selected.mode === "ai" ? (
                <form action={takeHumanHandoff}>
                  <input type="hidden" name="conversationId" value={data.selected.id} />
                  <SubmitButton label="Assumir (humano)" pendingLabel="…" className="quiet" />
                </form>
              ) : (
                <form action={returnToAi}>
                  <input type="hidden" name="conversationId" value={data.selected.id} />
                  <SubmitButton label="Devolver à IA" pendingLabel="…" className="quiet" />
                </form>
              )}
            </div>

            <details>
              <summary>Simular mensagem do cliente (sem WhatsApp)</summary>
              <form action={simulateAgentMessage} className="stack" style={{ marginTop: 12 }}>
                <input type="hidden" name="conversationId" value={data.selected.id} />
                <input type="hidden" name="externalKey" value={data.selected.externalKey} />
                <textarea name="text" rows={2} required placeholder="Ex.: meus horários" />
                <SubmitButton label="Enviar ao agente" pendingLabel="Pensando…" />
              </form>
            </details>

            <form action={linkAgentConversation} className="row">
              <input type="hidden" name="conversationId" value={data.selected.id} />
              <label>
                Vincular cliente
                <select name="clientId" required defaultValue={data.selected.clientId ?? ""}>
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
          </div>
        ) : null}
      </div>
      </div>

      <details className="agent-sim-start">
        <summary>Abrir conversa de teste (simulador)</summary>
        <form action={startSimulatorConversation} className="row" style={{ marginTop: 12 }}>
          <label>
            Celular
            <input name="phone" inputMode="tel" placeholder="11999999999" required />
          </label>
          <SubmitButton label="Abrir" pendingLabel="Abrindo…" />
        </form>
      </details>
    </Panel>
  );
}
