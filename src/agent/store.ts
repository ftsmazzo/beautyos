import { randomBytes, randomUUID } from "crypto";
import { digits } from "@/catalog/format";
import { db } from "@/db/client";

export type AgentChannel = {
  id: string;
  provider: "simulador" | "evolution";
  phoneE164: string | null;
  webhookToken: string;
  instanceName: string | null;
  connectionStatus: string;
  displayName: string;
  businessName: string | null;
  greeting: string | null;
  handoffPhone: string | null;
  active: boolean;
};

export type AgentConversation = {
  id: string;
  clientId: string | null;
  externalKey: string;
  mode: "ai" | "human";
  status: string;
  lastMessageAt: string;
};

export async function ensureAgentChannel(accountId: string): Promise<AgentChannel> {
  const existing = await db()<AgentChannel[]>`
    SELECT id, provider, phone_e164 AS "phoneE164", webhook_token AS "webhookToken",
           instance_name AS "instanceName", connection_status AS "connectionStatus",
           display_name AS "displayName", business_name AS "businessName",
           greeting, handoff_phone AS "handoffPhone", active
    FROM agent_channels WHERE account_id = ${accountId}
  `;
  if (existing[0]) return existing[0];
  const account = await db()<{ name: string }[]>`SELECT name FROM accounts WHERE id = ${accountId}`;
  const id = randomUUID();
  const token = randomBytes(24).toString("hex");
  const business = account[0]?.name ?? "Barbearia";
  await db()`
    INSERT INTO agent_channels (
      id, account_id, provider, webhook_token, active, display_name, business_name, connection_status
    ) VALUES (
      ${id}, ${accountId}, 'simulador', ${token}, true, 'Agente', ${business}, 'disconnected'
    )
  `;
  return ensureAgentChannel(accountId);
}

export async function channelByToken(token: string) {
  if (!token || token.length < 8) return null;
  const rows = await db()<
    { id: string; accountId: string; provider: string; active: boolean; instanceName: string | null }[]
  >`
    SELECT id, account_id AS "accountId", provider, active, instance_name AS "instanceName"
    FROM agent_channels WHERE webhook_token = ${token}
  `;
  return rows[0] ?? null;
}

export async function channelByInstance(instanceName: string) {
  const name = instanceName.trim();
  if (!name) return null;
  const rows = await db()<
    { id: string; accountId: string; provider: string; active: boolean; webhookToken: string }[]
  >`
    SELECT id, account_id AS "accountId", provider, active, webhook_token AS "webhookToken"
    FROM agent_channels
    WHERE lower(instance_name) = ${name.toLowerCase()}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findClientByPhone(accountId: string, phoneRaw: string) {
  const phone = digits(phoneRaw);
  if (phone.length < 8) return null;
  const tail = phone.slice(-11);
  const rows = await db()<{ id: string; name: string; phone: string }[]>`
    SELECT id, name, phone
    FROM clients
    WHERE account_id = ${accountId}
      AND active
      AND right(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 11) = ${tail}
    ORDER BY name
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function findOrCreateConversation(
  accountId: string,
  externalKey: string,
  clientId?: string | null,
) {
  const key = digits(externalKey).slice(-11) || externalKey.trim().slice(0, 80) || `sim-${randomUUID().slice(0, 8)}`;
  const existing = await db()<AgentConversation[]>`
    SELECT id, client_id AS "clientId", external_key AS "externalKey",
           mode, status,
           to_char(last_message_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS "lastMessageAt"
    FROM agent_conversations
    WHERE account_id = ${accountId} AND external_key = ${key}
  `;
  if (existing[0]) {
    if (clientId && !existing[0].clientId) {
      await db()`
        UPDATE agent_conversations SET client_id = ${clientId}
        WHERE id = ${existing[0].id}
      `;
      return { ...existing[0], clientId };
    }
    return existing[0];
  }
  const matched = clientId ?? (await findClientByPhone(accountId, key))?.id ?? null;
  const id = randomUUID();
  await db()`
    INSERT INTO agent_conversations (id, account_id, client_id, external_key, mode, status)
    VALUES (${id}, ${accountId}, ${matched}, ${key}, 'ai', 'aberta')
  `;
  return {
    id,
    clientId: matched,
    externalKey: key,
    mode: "ai" as const,
    status: "aberta",
    lastMessageAt: "",
  };
}

export async function appendMessage(
  accountId: string,
  conversationId: string,
  direction: "in" | "out" | "system",
  body: string,
) {
  const id = randomUUID();
  const text = body.trim().slice(0, 4000) || "—";
  await db()`
    INSERT INTO agent_messages (id, account_id, conversation_id, direction, body)
    VALUES (${id}, ${accountId}, ${conversationId}, ${direction}, ${text})
  `;
  await db()`
    UPDATE agent_conversations
    SET last_message_at = now(), status = 'aberta'
    WHERE id = ${conversationId}
  `;
  return id;
}

export async function linkConversationClient(
  accountId: string,
  conversationId: string,
  clientId: string,
) {
  await db()`
    UPDATE agent_conversations
    SET client_id = ${clientId}
    WHERE id = ${conversationId} AND account_id = ${accountId}
  `;
}

export async function setConversationMode(
  accountId: string,
  conversationId: string,
  mode: "ai" | "human",
) {
  await db()`
    UPDATE agent_conversations
    SET mode = ${mode}
    WHERE id = ${conversationId} AND account_id = ${accountId}
  `;
}

export async function updateChannel(
  accountId: string,
  patch: {
    active?: boolean;
    provider?: "simulador" | "evolution";
    phoneE164?: string | null;
    instanceName?: string | null;
    connectionStatus?: string;
    displayName?: string;
    businessName?: string | null;
    greeting?: string | null;
    handoffPhone?: string | null;
    rotateToken?: boolean;
  },
) {
  const channel = await ensureAgentChannel(accountId);
  const token = patch.rotateToken ? randomBytes(24).toString("hex") : channel.webhookToken;
  await db()`
    UPDATE agent_channels SET
      provider = ${patch.provider ?? channel.provider},
      active = ${patch.active ?? channel.active},
      phone_e164 = ${patch.phoneE164 === undefined ? channel.phoneE164 : patch.phoneE164},
      webhook_token = ${token},
      instance_name = ${patch.instanceName === undefined ? channel.instanceName : patch.instanceName},
      connection_status = ${patch.connectionStatus ?? channel.connectionStatus},
      display_name = ${patch.displayName ?? channel.displayName},
      business_name = ${patch.businessName === undefined ? channel.businessName : patch.businessName},
      greeting = ${patch.greeting === undefined ? channel.greeting : patch.greeting},
      handoff_phone = ${patch.handoffPhone === undefined ? channel.handoffPhone : patch.handoffPhone}
    WHERE id = ${channel.id}
  `;
  return ensureAgentChannel(accountId);
}

export async function clearInbox(accountId: string) {
  await db()`DELETE FROM agent_messages WHERE account_id = ${accountId}`;
  await db()`DELETE FROM agent_conversations WHERE account_id = ${accountId}`;
}
