import {
  connectInstance,
  createBaileysInstance,
  evolutionInstanceName,
  extractQrBase64,
  fetchInstances,
  getConnectionState,
  mapConnectionStatus,
  phoneFromJid,
  setInstanceWebhook,
  type EvolutionInstance,
} from "@/agent/evolution/client";
import { evolutionConfigured, getAgentWebhookUrl } from "@/agent/evolution/config";
import { ensureAgentChannel, updateChannel } from "@/agent/store";
import { db } from "@/db/client";

export type EvolutionConnectionView = {
  configured: boolean;
  instanceName: string | null;
  status: string;
  phoneE164: string | null;
  qrcodeBase64: string | null;
  availableInstances: string[];
  openAvailableInstances: string[];
  suggestedInstanceName: string;
  displayName: string;
  webhookHint: string;
};

function pickPhone(inst: EvolutionInstance | undefined) {
  if (!inst) return null;
  const owner = inst.owner ?? inst.ownerJid ?? inst.number ?? inst.instance?.owner ?? null;
  if (!owner) return null;
  return phoneFromJid(owner.includes("@") ? owner : `${owner}@s.whatsapp.net`);
}

function liveStatus(inst: EvolutionInstance | undefined) {
  if (!inst) return null;
  const raw =
    inst.connectionStatus ??
    inst.instance?.connectionStatus ??
    inst.instance?.state ??
    inst.instance?.status;
  return raw ? mapConnectionStatus(String(raw)) : null;
}

function suggestInstanceName(accountName: string) {
  return (
    accountName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "beautyos"
  );
}

export async function getEvolutionConnection(
  accountId: string,
  accountName: string,
): Promise<EvolutionConnectionView> {
  const channel = await ensureAgentChannel(accountId);
  const suggested = channel.instanceName || suggestInstanceName(accountName);
  const base: EvolutionConnectionView = {
    configured: evolutionConfigured(),
    instanceName: channel.instanceName,
    status: channel.connectionStatus || "disconnected",
    phoneE164: channel.phoneE164,
    qrcodeBase64: null,
    availableInstances: [],
    openAvailableInstances: [],
    suggestedInstanceName: suggested,
    displayName: channel.displayName,
    webhookHint: getAgentWebhookUrl(channel.webhookToken),
  };
  if (!base.configured) return base;

  try {
    const list = await fetchInstances();
    const claimedRows = await db()<{ name: string | null }[]>`
      SELECT instance_name AS name FROM agent_channels
      WHERE instance_name IS NOT NULL AND account_id <> ${accountId}
    `;
    const claimed = new Set(claimedRows.map((row) => (row.name ?? "").toLowerCase()));
    const names = list.map(evolutionInstanceName).filter(Boolean);
    base.availableInstances = names;
    base.openAvailableInstances = list
      .filter((inst) => liveStatus(inst) === "connected")
      .map(evolutionInstanceName)
      .filter((name) => name && !claimed.has(name.toLowerCase()));

    if (channel.instanceName) {
      const inst = list.find(
        (item) => evolutionInstanceName(item).toLowerCase() === channel.instanceName!.toLowerCase(),
      );
      const status = liveStatus(inst) ?? (await readState(channel.instanceName));
      const phone = pickPhone(inst) ?? channel.phoneE164;
      if (status !== channel.connectionStatus || phone !== channel.phoneE164) {
        await updateChannel(accountId, {
          connectionStatus: status,
          phoneE164: phone,
          provider: "evolution",
        });
      }
      base.status = status;
      base.phoneE164 = phone;
    }
  } catch {
    base.status = channel.connectionStatus || "disconnected";
  }
  return base;
}

async function readState(instanceName: string) {
  try {
    const state = await getConnectionState(instanceName);
    const raw = state.instance?.state ?? state.instance?.status ?? state.state ?? state.status ?? "";
    return mapConnectionStatus(String(raw));
  } catch {
    return "disconnected";
  }
}

export async function linkEvolutionInstance(accountId: string, instanceName: string) {
  const name = instanceName.trim();
  if (!name) throw new Error("Informe o nome da instância na Evolution.");
  if (!evolutionConfigured()) throw new Error("Configure EVOLUTION_URL e EVOLUTION_API_KEY no servidor.");
  const channel = await ensureAgentChannel(accountId);
  await setInstanceWebhook(name, getAgentWebhookUrl(channel.webhookToken));
  const list = await fetchInstances();
  const inst = list.find((item) => evolutionInstanceName(item).toLowerCase() === name.toLowerCase());
  const status = liveStatus(inst) ?? (await readState(name));
  return updateChannel(accountId, {
    provider: "evolution",
    instanceName: name,
    connectionStatus: status,
    phoneE164: pickPhone(inst),
    active: true,
  });
}

export async function startEvolutionPairing(accountId: string, accountName: string) {
  if (!evolutionConfigured()) throw new Error("Configure EVOLUTION_URL e EVOLUTION_API_KEY no servidor.");
  const channel = await ensureAgentChannel(accountId);
  const name = channel.instanceName || suggestInstanceName(accountName);
  const webhook = getAgentWebhookUrl(channel.webhookToken);
  await createBaileysInstance(name, webhook);
  try {
    await setInstanceWebhook(name, webhook);
  } catch {
    /* create já pode ter webhook */
  }
  const connect = await connectInstance(name);
  const qr = extractQrBase64(connect);
  const status = qr ? "pairing" : await readState(name);
  await updateChannel(accountId, {
    provider: "evolution",
    instanceName: name,
    connectionStatus: status,
    active: true,
  });
  const view = await getEvolutionConnection(accountId, accountName);
  return { ...view, qrcodeBase64: qr };
}

export async function refreshEvolutionPairing(accountId: string, accountName: string) {
  return getEvolutionConnection(accountId, accountName);
}

export async function requestEvolutionQr(accountId: string, accountName: string) {
  if (!evolutionConfigured()) throw new Error("Configure EVOLUTION_URL e EVOLUTION_API_KEY no servidor.");
  const channel = await ensureAgentChannel(accountId);
  const name = channel.instanceName || suggestInstanceName(accountName);
  if (!channel.instanceName) {
    return startEvolutionPairing(accountId, accountName);
  }
  const connect = await connectInstance(name);
  const qr = extractQrBase64(connect);
  await updateChannel(accountId, {
    connectionStatus: qr ? "pairing" : await readState(name),
    provider: "evolution",
  });
  const view = await getEvolutionConnection(accountId, accountName);
  return { ...view, qrcodeBase64: qr };
}
