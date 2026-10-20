/** Stub pronto para Meta Cloud API quando houver credenciais. */
export type WhatsAppCloudCredentials = {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
};

export type InboundWhatsAppStub = {
  from: string;
  text: string;
  externalId?: string;
};

export function parseWhatsAppStubPayload(body: unknown): InboundWhatsAppStub | null {
  if (!body || typeof body !== "object") return null;
  const data = body as Record<string, unknown>;
  const from = String(data.from ?? data.phone ?? "").trim();
  const text = String(data.text ?? data.body ?? data.message ?? "").trim();
  if (!from || !text) return null;
  const externalId = data.externalId ? String(data.externalId) : undefined;
  return { from, text, externalId };
}

export async function sendWhatsAppCloudMessage(
  _credentials: WhatsAppCloudCredentials,
  _to: string,
  _text: string,
): Promise<{ ok: false; reason: "not_configured" }> {
  return { ok: false, reason: "not_configured" };
}
