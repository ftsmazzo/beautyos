import { after } from "next/server";
import { assertWebhookAuthorized, handleEvolutionWebhook } from "@/agent/evolution/inbound";
import { databaseReady } from "@/db/client";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function POST(request: Request) {
  await databaseReady();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "json" }, { status: 400 });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const auth = await assertWebhookAuthorized(request, body, token);
  if (!auth) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  after(async () => {
    try {
      await handleEvolutionWebhook(body, token);
    } catch (error) {
      console.error("[agent:webhook]", error);
    }
  });

  return Response.json({ ok: true, accepted: true });
}

export async function GET() {
  return Response.json({ ok: true, service: "beautyos-evolution-webhook" });
}
