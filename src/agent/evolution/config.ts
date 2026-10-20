export function evolutionConfigured() {
  return Boolean(process.env.EVOLUTION_URL?.trim() && process.env.EVOLUTION_API_KEY?.trim());
}

export function getEvolutionConfig() {
  const baseUrl = process.env.EVOLUTION_URL?.replace(/\/$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY?.trim();
  if (!baseUrl || !apiKey) {
    throw new Error("EVOLUTION_URL e EVOLUTION_API_KEY são obrigatórios");
  }
  return { baseUrl, apiKey };
}

export function getAppPublicUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "") ||
    "https://beautyos-app.kxryyk.easypanel.host"
  );
}

export function getAgentWebhookUrl(token: string) {
  const base = getAppPublicUrl();
  return `${base}/api/agent/webhook?token=${encodeURIComponent(token)}`;
}
