import { digits } from "@/catalog/format";
import { handleAgentMessage } from "@/agent/runtime";
import { sendTextMessage } from "@/agent/evolution/client";
import { channelByInstance, channelByToken, ensureAgentChannel, updateChannel } from "@/agent/store";
import { db } from "@/db/client";

type EvolutionWebhookBody = {
  event?: string;
  instance?: string;
  data?: unknown;
  apikey?: string;
};

type MessageUpsertData = {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string };
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string };
    imageMessage?: { caption?: string };
    videoMessage?: { caption?: string };
  };
};

function normalizeEvent(event: string | undefined) {
  return (event ?? "").toLowerCase().replace(/_/g, ".");
}

function extractText(data: MessageUpsertData) {
  const m = data.message;
  if (!m) return null;
  return (
    m.conversation?.trim() ||
    m.extendedTextMessage?.text?.trim() ||
    m.imageMessage?.caption?.trim() ||
    m.videoMessage?.caption?.trim() ||
    null
  );
}

function phoneFromRemoteJid(jid: string) {
  if (jid.includes("@g.us") || jid.includes("@broadcast") || jid.startsWith("status@")) return null;
  const user = jid.split("@")[0] ?? "";
  const phone = digits(user);
  if (phone.length < 8) return null;
  return phone.slice(-11);
}

export function assertWebhookAuthorized(request: Request, body: EvolutionWebhookBody, token: string | null) {
  if (token && token.length >= 8) {
    return channelByToken(token);
  }
  const secret = process.env.AGENT_WEBHOOK_SECRET?.trim();
  if (secret) {
    const url = new URL(request.url);
    const q = url.searchParams.get("secret");
    const header = request.headers.get("x-webhook-secret");
    if (q === secret || header === secret) return Promise.resolve({ viaSecret: true as const });
  }
  if (body.instance) return channelByInstance(String(body.instance));
  return Promise.resolve(null);
}

export async function handleEvolutionWebhook(body: EvolutionWebhookBody, token: string | null) {
  const event = normalizeEvent(body.event);
  const instance = String(body.instance ?? "").trim();
  if (!instance) return;

  let accountId: string | null = null;
  if (token) {
    const byToken = await channelByToken(token);
    accountId = byToken?.accountId ?? null;
  }
  if (!accountId) {
    const byInstance = await channelByInstance(instance);
    accountId = byInstance?.accountId ?? null;
  }
  if (!accountId) return;

  if (event === "connection.update") {
    const data = (body.data ?? {}) as { state?: string; status?: string };
    const raw = data.state ?? data.status ?? "";
    const status = /open|connected/i.test(raw)
      ? "connected"
      : /close|logout/i.test(raw)
        ? "disconnected"
        : "pairing";
    await updateChannel(accountId, { connectionStatus: status, provider: "evolution", instanceName: instance });
    return;
  }

  if (event !== "messages.upsert") return;
  const payload = body.data as MessageUpsertData | MessageUpsertData[] | { messages?: MessageUpsertData[] };
  const items: MessageUpsertData[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { messages?: MessageUpsertData[] }).messages)
      ? ((payload as { messages: MessageUpsertData[] }).messages)
      : [payload as MessageUpsertData];

  const channel = await ensureAgentChannel(accountId);
  if (!channel.active) return;

  for (const item of items) {
    if (item.key?.fromMe) continue;
    const jid = item.key?.remoteJid ?? "";
    const phone = phoneFromRemoteJid(jid);
    const text = extractText(item);
    if (!phone || !text) continue;

    const modeRows = await db()<{ mode: string }[]>`
      SELECT mode FROM agent_conversations
      WHERE account_id = ${accountId} AND external_key = ${phone}
      LIMIT 1
    `;
    if (modeRows[0]?.mode === "human") {
      const { findOrCreateConversation, appendMessage } = await import("@/agent/store");
      const conversation = await findOrCreateConversation(accountId, phone);
      await appendMessage(accountId, conversation.id, "in", text);
      continue;
    }

    const result = await handleAgentMessage({
      accountId,
      externalKey: phone,
      text,
    });

    if (channel.provider === "evolution" && channel.instanceName) {
      try {
        await sendTextMessage(channel.instanceName, phone, result.reply);
      } catch (error) {
        console.error("[evolution:send]", error);
      }
    }
  }
}
