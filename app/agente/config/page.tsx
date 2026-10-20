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

      <div className="row">
        <Link className="btn quiet" href="/agente">
          ← Voltar às conversas
        </Link>
      </div>

      <p>
        Aqui fica o WhatsApp da casa (Evolution), o nome/tom do agente e a fila de espera. As conversas
        do dia a dia ficam em <Link href="/agente">Conversas</Link>.
      </p>

      <div className="agent-config-grid">
        <EvolutionPanel initial={data.evolution} />

        <div className="card stack agent-card">
          <div className="agent-card-head">
            <strong>Personalidade</strong>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Orientação de tom — não é roteiro fixo. O nome é como ela se apresenta no Zap.
          </p>
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

        <div className="card stack agent-card">
          <div className="agent-card-head">
            <strong>Canal</strong>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Token do webhook Evolution (já embutido na URL do painel Evolution).
          </p>
          <p>
            <code>{data.channel.webhookToken}</code>
          </p>
          <form action={saveAgentChannelBasics} className="stack">
            <label className="row">
              <input type="checkbox" name="active" value="1" defaultChecked={data.channel.active} />
              Agente ativo (responde automaticamente)
            </label>
            <label className="row">
              <input type="checkbox" name="rotateToken" value="1" />
              Gerar novo token (reconfigure o webhook na Evolution)
            </label>
            <SubmitButton label="Salvar canal" pendingLabel="Salvando…" />
          </form>
        </div>
      </div>

      <div id="espera" className="card stack agent-card" style={{ marginTop: 16 }}>
        <div className="agent-card-head">
          <strong>Espera (fila da IA)</strong>
          <span className="agent-pill mute">{data.waitlist.length}</span>
        </div>
        {data.waitlist.length === 0 ? <p className="muted">Nenhuma espera aberta.</p> : null}
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
                    <div className="muted" style={{ fontSize: "0.85rem" }}>
                      {formatPhone(row.phone)}
                    </div>
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
    </Panel>
  );
}
