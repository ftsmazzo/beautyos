import { formatPhone } from "@/catalog/format";
import { db } from "@/db/client";
import { getEvolutionConnection } from "@/agent/evolution/connection";
import { ensureAgentChannel } from "@/agent/store";
import { listOpenWaitlist } from "@/agent/waitlist";

export type ConversationFilter = "todas" | "ai" | "human";

export async function agentInboxData(
  accountId: string,
  accountName: string,
  opts: { conversationId?: string | null; filter?: ConversationFilter },
) {
  const channel = await ensureAgentChannel(accountId);
  const evolution = await getEvolutionConnection(accountId, accountName);
  const filter = opts.filter ?? "todas";

  const conversations = await db()<
    {
      id: string;
      externalKey: string;
      clientId: string | null;
      clientName: string | null;
      phone: string | null;
      mode: string;
      status: string;
      lastMessageAt: string;
      preview: string | null;
    }[]
  >`
    SELECT c.id, c.external_key AS "externalKey", c.client_id AS "clientId",
           cl.name AS "clientName", cl.phone,
           c.mode, c.status,
           to_char(c.last_message_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS "lastMessageAt",
           (
             SELECT m.body FROM agent_messages m
             WHERE m.conversation_id = c.id
             ORDER BY m.created_at DESC
             LIMIT 1
           ) AS preview
    FROM agent_conversations c
    LEFT JOIN clients cl ON cl.id = c.client_id
    WHERE c.account_id = ${accountId}
      AND (${filter}::text = 'todas' OR c.mode = ${filter})
    ORDER BY c.last_message_at DESC
    LIMIT 80
  `;

  const rows = conversations.map((row) => ({
    ...row,
    label: row.clientName ?? (formatPhone(row.externalKey) || row.externalKey),
    phoneLabel: row.phone ? formatPhone(row.phone) : formatPhone(row.externalKey) || row.externalKey,
  }));

  const selectedId =
    opts.conversationId && rows.some((row) => row.id === opts.conversationId)
      ? opts.conversationId
      : null;

  const messages = selectedId
    ? await db()<
        { id: string; direction: string; body: string; createdAt: string }[]
      >`
        SELECT id, direction, body,
               to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI') AS "createdAt"
        FROM agent_messages
        WHERE conversation_id = ${selectedId} AND account_id = ${accountId}
        ORDER BY created_at
        LIMIT 200
      `
    : [];

  const selected = selectedId ? rows.find((row) => row.id === selectedId) ?? null : null;

  const clients = await db()<{ id: string; name: string; phone: string }[]>`
    SELECT id, name, phone FROM clients
    WHERE account_id = ${accountId} AND active
    ORDER BY name
    LIMIT 400
  `;

  return {
    channel,
    evolution,
    filter,
    conversations: rows,
    selected,
    selectedId,
    messages,
    clients,
    waitlistCount: (await listOpenWaitlist(accountId)).length,
  };
}

export async function agentConfigData(accountId: string, accountName: string) {
  const channel = await ensureAgentChannel(accountId);
  const evolution = await getEvolutionConnection(accountId, accountName);
  const waitlist = await listOpenWaitlist(accountId);
  return { channel, evolution, waitlist };
}
