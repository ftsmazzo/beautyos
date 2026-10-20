"use server";

import { requireAdmin, requireOperator } from "@/catalog/access";
import { FormError } from "@/catalog/errors";
import { digits } from "@/catalog/format";
import { settle } from "@/catalog/settle";
import { sendTextMessage } from "@/agent/evolution/client";
import { handleAgentMessage } from "@/agent/runtime";
import {
  appendMessage,
  clearInbox,
  ensureAgentChannel,
  findOrCreateConversation,
  linkConversationClient,
  setConversationMode,
  updateChannel,
} from "@/agent/store";
import { db } from "@/db/client";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function conversaUrl(id?: string | null, extra = "") {
  const base = id ? `/agente?c=${id}` : "/agente";
  if (!extra) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${extra}`;
}

export async function simulateAgentMessage(formData: FormData) {
  const user = await requireOperator();
  const text = String(formData.get("text") ?? "").trim();
  const conversationId = String(formData.get("conversationId") ?? "").trim();
  return settle(conversaUrl(conversationId || null), async () => {
    if (text.length < 1) throw new FormError("dados");
    let key = String(formData.get("externalKey") ?? "").trim() || "simulador";
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
    return conversaUrl(result.conversationId, "ok=agente");
  });
}

export async function startSimulatorConversation(formData: FormData) {
  const user = await requireOperator();
  const phone = digits(String(formData.get("phone") ?? ""));
  return settle("/agente", async () => {
    if (phone.length < 8) throw new FormError("dados");
    await ensureAgentChannel(user.accountId);
    const conversation = await findOrCreateConversation(user.accountId, phone);
    return conversaUrl(conversation.id);
  });
}

export async function linkAgentConversation(formData: FormData) {
  const user = await requireOperator();
  const conversationId = String(formData.get("conversationId") ?? "");
  const clientId = String(formData.get("clientId") ?? "");
  return settle(conversaUrl(conversationId), async () => {
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
    return conversaUrl(conversationId, "ok=vinculo");
  });
}

export async function takeHumanHandoff(formData: FormData) {
  const user = await requireOperator();
  const conversationId = String(formData.get("conversationId") ?? "");
  return settle(conversaUrl(conversationId), async () => {
    if (!UUID.test(conversationId)) throw new FormError("dados");
    await setConversationMode(user.accountId, conversationId, "human");
    await appendMessage(user.accountId, conversationId, "system", "Balcão assumiu o atendimento.");
    return conversaUrl(conversationId, "ok=humano");
  });
}

export async function returnToAi(formData: FormData) {
  const user = await requireOperator();
  const conversationId = String(formData.get("conversationId") ?? "");
  return settle(conversaUrl(conversationId), async () => {
    if (!UUID.test(conversationId)) throw new FormError("dados");
    await setConversationMode(user.accountId, conversationId, "ai");
    await appendMessage(user.accountId, conversationId, "system", "Agente voltou a atender.");
    return conversaUrl(conversationId, "ok=ia");
  });
}

export async function sendHumanReply(formData: FormData) {
  const user = await requireOperator();
  const conversationId = String(formData.get("conversationId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  return settle(conversaUrl(conversationId), async () => {
    if (!UUID.test(conversationId) || text.length < 1) throw new FormError("dados");
    const rows = await db()<{ externalKey: string; mode: string }[]>`
      SELECT external_key AS "externalKey", mode
      FROM agent_conversations
      WHERE id = ${conversationId} AND account_id = ${user.accountId}
    `;
    if (!rows[0]) throw new FormError("fora");
    await setConversationMode(user.accountId, conversationId, "human");
    await appendMessage(user.accountId, conversationId, "out", text);
    const channel = await ensureAgentChannel(user.accountId);
    if (channel.provider === "evolution" && channel.instanceName) {
      try {
        await sendTextMessage(channel.instanceName, rows[0].externalKey, text);
      } catch {
        throw new FormError("dados");
      }
    }
    return conversaUrl(conversationId, "ok=humano");
  });
}

export async function clearAgentInbox() {
  const user = await requireAdmin();
  return settle("/agente", async () => {
    await clearInbox(user.accountId);
    return "/agente?ok=limpa";
  });
}

export async function saveAgentPersona(formData: FormData) {
  const user = await requireAdmin();
  return settle("/agente/config", async () => {
    const displayName = String(formData.get("displayName") ?? "").trim().slice(0, 80);
    const businessName = String(formData.get("businessName") ?? "").trim().slice(0, 120) || null;
    const greeting = String(formData.get("greeting") ?? "").trim().slice(0, 240) || null;
    const handoffPhone = digits(String(formData.get("handoffPhone") ?? "")) || null;
    if (displayName.length < 2) throw new FormError("dados");
    await updateChannel(user.accountId, {
      displayName,
      businessName,
      greeting,
      handoffPhone: handoffPhone ? `+${handoffPhone}` : null,
    });
    return "/agente/config?ok=persona";
  });
}

export async function saveAgentChannelBasics(formData: FormData) {
  const user = await requireAdmin();
  return settle("/agente/config", async () => {
    const active = formData.get("active") === "1";
    const rotateToken = formData.get("rotateToken") === "1";
    await updateChannel(user.accountId, { active, rotateToken });
    return "/agente/config?ok=canal";
  });
}

