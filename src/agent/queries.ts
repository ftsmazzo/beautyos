import { formatPhone } from "@/catalog/format";
import { db } from "@/db/client";
import { ensureAgentChannel } from "@/agent/store";
import { listOpenWaitlist } from "@/agent/waitlist";

export async function agentPanelData(accountId: string, conversationId?: string | null) {
  const channel = await ensureAgentChannel(accountId);
  const waitlist = await listOpenWaitlist(accountId);
  const conversations = await db()<
    {
      id: string;
      externalKey: string;
      clientId: string | null;
      clientName: string | null;
      phone: string | null;
      status: string;
      lastMessageAt: string;
      preview: string | null;
    }[]
  >`
    SELECT c.id, c.external_key AS "externalKey", c.client_id AS "clientId",
           cl.name AS "clientName", cl.phone,
           c.status,
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
    ORDER BY c.last_message_at DESC
    LIMIT 60
  `;
  const selectedId = conversationId && conversations.some((row) => row.id === conversationId)
    ? conversationId
    : conversations[0]?.id ?? null;
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
  const clients = await db()<{ id: string; name: string; phone: string }[]>`
    SELECT id, name, phone FROM clients
    WHERE account_id = ${accountId} AND active
    ORDER BY name
    LIMIT 400
  `;
  return {
    channel,
    waitlist,
    conversations: conversations.map((row) => ({
      ...row,
      label: row.clientName ?? (formatPhone(row.externalKey) || row.externalKey),
      phoneLabel: row.phone ? formatPhone(row.phone) : formatPhone(row.externalKey) || row.externalKey,
    })),
    selectedId,
    messages,
    clients,
  };
}
