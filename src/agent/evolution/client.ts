import { getEvolutionConfig } from "@/agent/evolution/config";

type EvolutionFetchOptions = {
  method?: string;
  body?: unknown;
};

const WEBHOOK_EVENTS = [
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "CONNECTION_UPDATE",
  "QRCODE_UPDATED",
] as const;

function formatEvolutionError(json: unknown, fallback: string) {
  if (typeof json !== "object" || !json) return fallback;
  const message = (json as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) {
    return message.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).filter(Boolean).join(" · ");
  }
  return fallback;
}

async function evolutionFetch<T>(path: string, options: EvolutionFetchOptions = {}): Promise<T> {
  const { baseUrl, apiKey } = getEvolutionConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? (options.body ? "POST" : "GET"),
    headers: {
      apikey: apiKey,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      json = { raw: text };
    }
  }
  if (!res.ok) {
    throw new Error(`Evolution ${path}: ${formatEvolutionError(json, text.slice(0, 200) || res.statusText)}`);
  }
  return json as T;
}

export type EvolutionInstance = {
  instance?: { instanceName?: string; status?: string; owner?: string; connectionStatus?: string; state?: string };
  instanceName?: string;
  name?: string;
  connectionStatus?: string;
  owner?: string;
  ownerJid?: string;
  number?: string;
};

export function evolutionInstanceName(inst: EvolutionInstance) {
  return (inst.instance?.instanceName ?? inst.instanceName ?? inst.name ?? "").trim();
}

export function mapConnectionStatus(raw: string) {
  const value = raw.toLowerCase();
  if (value.includes("open") || value === "connected") return "connected";
  if (value.includes("close") || value.includes("logout")) return "disconnected";
  if (value.includes("connecting") || value.includes("qr")) return "pairing";
  return value || "disconnected";
}

export async function fetchInstances(): Promise<EvolutionInstance[]> {
  const data = await evolutionFetch<EvolutionInstance[] | { instances?: EvolutionInstance[] }>(
    "/instance/fetchInstances",
  );
  if (Array.isArray(data)) return data;
  return data.instances ?? [];
}

export async function createBaileysInstance(instanceName: string, webhookUrl: string) {
  const body = {
    instanceName,
    integration: "WHATSAPP-BAILEYS",
    qrcode: false,
    webhook: {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: [...WEBHOOK_EVENTS],
    },
  };
  try {
    return await evolutionFetch("/instance/create", { body });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    if (/already|exist/i.test(msg)) return null;
    throw error;
  }
}

export async function connectInstance(instanceName: string) {
  return evolutionFetch<{
    qrcode?: { base64?: string; code?: string };
    base64?: string;
  }>(`/instance/connect/${encodeURIComponent(instanceName)}`);
}

export async function getConnectionState(instanceName: string) {
  return evolutionFetch<{
    instance?: { state?: string; status?: string };
    state?: string;
    status?: string;
  }>(`/instance/connectionState/${encodeURIComponent(instanceName)}`);
}

export async function setInstanceWebhook(instanceName: string, url: string) {
  return evolutionFetch(`/webhook/set/${encodeURIComponent(instanceName)}`, {
    body: {
      enabled: true,
      url,
      byEvents: false,
      base64: false,
      events: [...WEBHOOK_EVENTS],
    },
  });
}

export async function sendTextMessage(instanceName: string, numberDigits: string, text: string) {
  return evolutionFetch(`/message/sendText/${encodeURIComponent(instanceName)}`, {
    body: {
      number: numberDigits.replace(/\D/g, ""),
      text,
    },
  });
}

export function extractQrBase64(payload: { qrcode?: { base64?: string }; base64?: string } | null) {
  const raw = payload?.qrcode?.base64 ?? payload?.base64 ?? null;
  if (!raw) return null;
  return raw.startsWith("data:") ? raw : `data:image/png;base64,${raw}`;
}

export function phoneFromJid(jid: string) {
  const user = jid.split("@")[0] ?? "";
  const digits = user.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return digits.startsWith("55") ? `+${digits}` : `+55${digits}`;
}
