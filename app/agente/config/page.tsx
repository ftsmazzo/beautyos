import Link from "next/link";
import { saveAgentChannelBasics, saveAgentPersona } from "@/agent/actions";
import { agentConfigData } from "@/agent/queries";
import { requireAdmin } from "@/catalog/access";
import { formatDay, formatPhone } from "@/catalog/format";
import { ErrorNote } from "@/ui/error-note";
import { EvolutionPanel } from "@/ui/evolution-panel";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

function Saved({ code }: { code?: string }) {
  const map: Record<string, string> = {
    persona: "Personalidade salva.",
    canal: "Canal salvo.",
    evolution: "Evolution vinculada.",
    qr: "Pareamento / QR atualizado.",
    status: "Status atualizado.",
  };
  if (!code || !map[code]) return null;
  return <p className="ok banner">{map[code]}</p>;
}

export default async function AgenteConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await requireAdmin();
  const query = await searchParams;
  const data = await agentConfigData(user.accountId, user.accountName);

  return (
    <Panel user={user} current="/agente" title="Agente · configuração">
      <ErrorNote code={query.erro} />
      <Saved code={query.ok} />

      <div className="desk">
      <div className="desk-bar">
        <Link className="btn btn-outline" href="/agente">
          ← Conversas
        </Link>
        <span className="badge bg-secondary-lt">{data.waitlist.length} na espera</span>
      </div>
      <div id="espera" className="queue" style={{ overflowX: "auto" }}>
        {data.waitlist.length === 0 ? <p className="queue-empty">Nenhuma espera aberta.</p> : null}
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
                    <div>{formatPhone(row.phone)}</div>
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

      <div className="agent-config-grid">
        <EvolutionPanel initial={data.evolution} />

        <div className="queue stack">
          <div className="desk-bar">
            <span className="day-label">Personalidade</span>
          </div>
          <form action={saveAgentPersona} className="stack">
            <label>
              Nome do agente
              <input name="displayName" defaultValue={data.channel.displayName} required maxLength={80} />
            </label>
            <label>
              Nome do negócio
              <input name="businessName" defaultValue={data.channel.businessName ?? ""} maxLength={120} />
            </label>
            <label>
              Saudação (orientação)
              <input
                name="greeting"
                defaultValue={data.channel.greeting ?? ""}
                maxLength={240}
                placeholder="Olá! Aqui é a recepção…"
              />
            </label>
            <label>
              Celular para alerta de handoff
              <input
                name="handoffPhone"
                defaultValue={data.channel.handoffPhone ?? ""}
                inputMode="tel"
                placeholder="11999999999"
              />
            </label>
            <SubmitButton label="Salvar personalidade" pendingLabel="Salvando…" />
          </form>
        </div>

        <div className="queue stack">
          <div className="desk-bar">
            <span className="day-label">Canal</span>
            <span className="badge bg-secondary-lt">{data.channel.active ? "Ativo" : "Pausado"}</span>
            <span className="badge bg-secondary-lt">{data.channel.webhookToken}</span>
          </div>
          <form action={saveAgentChannelBasics} className="stack">
            <label className="bos-row">
              <input type="checkbox" name="active" value="1" defaultChecked={data.channel.active} />
              Agente ativo (responde automaticamente)
            </label>
            <label className="bos-row">
              <input type="checkbox" name="rotateToken" value="1" />
              Gerar novo token
            </label>
            <SubmitButton label="Salvar canal" pendingLabel="Salvando…" />
          </form>
        </div>
      </div>
      </div>
    </Panel>
  );
}
