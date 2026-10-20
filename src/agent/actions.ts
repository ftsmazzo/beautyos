"use server";

import { requireAdmin, requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { digits } from "@/catalog/format";
import { settle } from "@/catalog/settle";
import { handleAgentMessage } from "@/agent/runtime";
import {
  ensureAgentChannel,
  findOrCreateConversation,
  linkConversationClient,
  updateChannel,
} from "@/agent/store";
import { db } from "@/db/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function simulateAgentMessage(formData: FormData) {
  const user = await requireOperator();
  const text = String(formData.get("text") ?? "").trim();
  const externalKey = String(formData.get("externalKey") ?? "").trim() || "simulador";
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  return settle(`/agente${conversationId ? `?c=${conversationId}` : ""}`, async () => {
    if (text.length < 1) throw new FormError("dados");
    let key = externalKey;
    if (conversationId && UUID.test(conversationId)) {
      const rows = await db()<{ externalKey: string }[]>`
        SELECT external_key AS "externalKey"
        FROM agent_conversations
        WHERE id = ${conversationId} AND account_id = ${user.accountId}
      `;
      if (rows[0]) key = rows[0].externalKey;
    }
    const result = await handleAgentMessage({
      accountId: user.accountId,
      externalKey: key,
      text,
      actorId: user.id,
    });
    return `/agente?c=${result.conversationId}&ok=agente`;
  });
}

export async function startSimulatorConversation(formData: FormData) {
  const user = await requireOperator();
  const phone = digits(String(formData.get("phone") ?? ""));
  return settle("/agente", async () => {
    if (phone.length < 8) throw new FormError("dados");
    await ensureAgentChannel(user.accountId);
    const conversation = await findOrCreateConversation(user.accountId, phone);
    return `/agente?c=${conversation.id}`;
  });
}

export async function linkAgentConversation(formData: FormData) {
  const user = await requireOperator();
  const conversationId = String(formData.get("conversationId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  return settle(`/agente?c=${conversationId}`, async () => {
    if (!UUID.test(conversationId) || !UUID.test(clientId)) throw new FormError("dados");
    const owned = await db()`
      SELECT id FROM clients WHERE id = ${clientId} AND account_id = ${user.accountId} AND active
    `;
    if (!owned.length) throw new FormError("cliente");
    const conv = await db()`
      SELECT id FROM agent_conversations WHERE id = ${conversationId} AND account_id = ${user.accountId}
    `;
    if (!conv.length) throw new FormError("fora");
    await linkConversationClient(user.accountId, conversationId, clientId);
    return `/agente?c=${conversationId}&ok=vinculo`;
  });
}

export async function saveAgentChannel(formData: FormData) {
  const user = await requireAdmin();
  return settle("/agente", async () => {
    const active = formData.get("active") === "1";
    const provider = formData.get("provider") === "whatsapp_cloud" ? "whatsapp_cloud" : "simulador";
    const phoneRaw = String(formData.get("phone") ?? "").trim();
    const phoneE164 = phoneRaw ? `+${digits(phoneRaw)}` : null;
    const rotateToken = formData.get("rotateToken") === "1";
    await updateChannel(user.accountId, { active, provider, phoneE164, rotateToken });
    return "/agente?ok=canal";
  });
}
