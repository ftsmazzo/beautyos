import { parseWhatsAppStubPayload, sendWhatsAppCloudMessage } from "@/agent/adapters";
import { handleAgentMessage } from "@/agent/runtime";
import { channelByToken, ensureAgentChannel } from "@/agent/store";
import { databaseReady } from "@/db/client";

export const dynamic = "force-dynamic";

function tokenFrom(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("token");
  if (query) return query.trim();
  const header = request.headers.get("x-agent-token") ?? request.headers.get("authorization");
  if (!header) return "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

export async function POST(request: Request) {
  await databaseReady();
  const token = tokenFrom(request);
  const channel = await channelByToken(token);
  if (!channel) {
    return Response.json({ ok: false, error: "token" }, { status: 401 });
  }
  if (!channel.active) {
    return Response.json({ ok: false, error: "inactive" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "json" }, { status: 400 });
  }
  const inbound = parseWhatsAppStubPayload(body);
  if (!inbound) {
    return Response.json({ ok: false, error: "payload" }, { status: 400 });
  }
  const result = await handleAgentMessage({
    accountId: channel.accountId,
    externalKey: inbound.from,
    text: inbound.text,
  });
  if (channel.provider === "whatsapp_cloud") {
    await sendWhatsAppCloudMessage(
      { phoneNumberId: "", accessToken: "", verifyToken: "" },
      inbound.from,
      result.reply,
    );
  }
  await ensureAgentChannel(channel.accountId);
  return Response.json({
    ok: true,
    conversationId: result.conversationId,
    reply: result.reply,
    delivery: channel.provider === "whatsapp_cloud" ? "stub" : "none",
  });
}
