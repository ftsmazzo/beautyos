import { todaySaoPaulo } from "@/catalog/format";
import { dayParam, shiftDay } from "@/desk/clock";
import { appendMessage, findOrCreateConversation } from "@/agent/store";
import { runTool, type ToolContext, type ToolName } from "@/agent/tools";

const HELP = `Posso ajudar com:
• meus horários
• meus pacotes
• serviços
• vagas AAAA-MM-DD serviço
• agendar AAAA-MM-DD HH:MM serviço
• cancelar [código ou AAAA-MM-DD]
• remarcar AAAA-MM-DD HH:MM
• espera AAAA-MM-DD serviço
• sair espera`;

function normalize(text: string) {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function parseRelativeDay(token: string) {
  const today = todaySaoPaulo();
  if (token === "hoje") return today;
  if (token === "amanha") return shiftDay(today, 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return dayParam(token);
  const br = token.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (br) {
    const day = br[1].padStart(2, "0");
    const month = br[2].padStart(2, "0");
    const year = br[3]
      ? br[3].length === 2
        ? `20${br[3]}`
        : br[3]
      : today.slice(0, 4);
    return dayParam(`${year}-${month}-${day}`);
  }
  return null;
}

function extractDay(text: string) {
  const m =
    text.match(/\b(\d{4}-\d{2}-\d{2})\b/) ||
    text.match(/\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/) ||
    text.match(/\b(hoje|amanha)\b/);
  return m ? parseRelativeDay(m[1]) : null;
}

function extractTime(text: string) {
  const m = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

function extractUuidHint(text: string) {
  const full = text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  if (full) return full[1];
  const short = text.match(/\b([0-9a-f]{8})\b/i);
  return short?.[1] ?? null;
}

function serviceHint(text: string, drop: RegExp) {
  return text.replace(drop, "").replace(/\b(hoje|amanha|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|[01]?\d:[0-5]\d)\b/g, "").trim();
}

async function shortCircuit(ctx: ToolContext, raw: string) {
  const text = normalize(raw);
  if (!text || /^(menu|ajuda|oi|ola|bom dia|boa tarde|boa noite)\b/.test(text)) {
    return HELP;
  }
  if (/^(meus? horarios?|minha agenda|agenda)\b/.test(text)) {
    return (await runTool("meus_horarios", ctx, {})).text;
  }
  if (/^(meus? pacotes?|creditos?|credito|pacote)\b/.test(text)) {
    return (await runTool("meus_pacotes", ctx, {})).text;
  }
  if (/^(servicos?|cardapio|precos?)\b/.test(text)) {
    return (await runTool("catalogo", ctx, {})).text;
  }
  if (/^sair espera|^sair da espera|^cancelar espera/.test(text)) {
    return (await runTool("sair_espera", ctx, {})).text;
  }
  if (/^(espera|lista de espera|entrar espera)\b/.test(text)) {
    const day = extractDay(text);
    const service = serviceHint(text, /^(espera|lista de espera|entrar espera)\b/);
    if (!day || !service) return "Para espera: espera AAAA-MM-DD nome do serviço";
    return (await runTool("entrar_espera", ctx, { day, service })).text;
  }
  if (/^(vagas|horarios livres|horarios disponiveis)\b/.test(text)) {
    const day = extractDay(text);
    const service = serviceHint(text, /^(vagas|horarios livres|horarios disponiveis)\b/);
    if (!day || !service) return "Para vagas: vagas AAAA-MM-DD nome do serviço";
    return (await runTool("vagas", ctx, { day, service })).text;
  }
  if (/^cancelar\b/.test(text)) {
    const appointmentId = extractUuidHint(text) ?? undefined;
    const day = extractDay(text) ?? undefined;
    return (await runTool("cancelar", ctx, { appointmentId, day })).text;
  }
  if (/^remarcar\b/.test(text)) {
    const day = extractDay(text);
    const start = extractTime(text);
    const appointmentId = extractUuidHint(text) ?? undefined;
    if (!day || !start) return "Para remarcar: remarcar AAAA-MM-DD HH:MM";
    return (await runTool("remarcar", ctx, { day, start, appointmentId })).text;
  }
  if (/^(agendar|marcar|reservar)\b/.test(text)) {
    const day = extractDay(text);
    const start = extractTime(text);
    const service = serviceHint(text, /^(agendar|marcar|reservar)\b/);
    if (!day || !start || !service) return "Para agendar: agendar AAAA-MM-DD HH:MM nome do serviço";
    return (await runTool("agendar", ctx, { day, start, service })).text;
  }
  return null;
}

const OPENAI_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "meus_horarios",
      description: "Lista horários futuros do cliente",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "meus_pacotes",
      description: "Lista pacotes e créditos do cliente",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "catalogo",
      description: "Lista serviços bookable",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "vagas",
      description: "Lista vagas livres",
      parameters: {
        type: "object",
        properties: {
          day: { type: "string" },
          service: { type: "string" },
          professional: { type: "string" },
        },
        required: ["day", "service"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "agendar",
      description: "Agenda horário",
      parameters: {
        type: "object",
        properties: {
          day: { type: "string" },
          start: { type: "string" },
          service: { type: "string" },
          professional: { type: "string" },
        },
        required: ["day", "start", "service"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "cancelar",
      description: "Cancela horário",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
          day: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remarcar",
      description: "Cancela e agenda de novo",
      parameters: {
        type: "object",
        properties: {
          appointmentId: { type: "string" },
          day: { type: "string" },
          start: { type: "string" },
          service: { type: "string" },
          professional: { type: "string" },
        },
        required: ["day", "start"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "entrar_espera",
      description: "Entra na fila de espera da IA",
      parameters: {
        type: "object",
        properties: {
          day: { type: "string" },
          service: { type: "string" },
          professional: { type: "string" },
          note: { type: "string" },
        },
        required: ["day", "service"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "sair_espera",
      description: "Sai da espera",
      parameters: { type: "object", properties: {} },
    },
  },
];

async function optionalLlm(ctx: ToolContext, text: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Você é o agente da barbearia em português do Brasil. Respostas curtas. Use tools para agenda, pacote e espera. Não invente horários. Se faltar cliente vinculado, diga para o balcão vincular.",
          },
          {
            role: "user",
            content: ctx.clientId
              ? text
              : `${text}\n\n(Conversa ainda sem cliente vinculado.)`,
          },
        ],
        tools: OPENAI_TOOLS,
        tool_choice: "auto",
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as {
      choices?: { message?: { content?: string | null; tool_calls?: { function: { name: string; arguments: string } }[] } }[];
    };
    const message = data.choices?.[0]?.message;
    if (!message) return null;
    if (message.tool_calls?.length) {
      const parts: string[] = [];
      for (const call of message.tool_calls.slice(0, 3)) {
        const name = call.function.name as ToolName;
        let args: Record<string, string> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}") as Record<string, string>;
        } catch {
          args = {};
        }
        const result = await runTool(name, ctx, args);
        parts.push(result.text);
      }
      return parts.join("\n\n");
    }
    return message.content?.trim() || null;
  } catch {
    return null;
  }
}

export async function handleAgentMessage(input: {
  accountId: string;
  externalKey: string;
  text: string;
  actorId?: string | null;
}) {
  const conversation = await findOrCreateConversation(input.accountId, input.externalKey);
  await appendMessage(input.accountId, conversation.id, "in", input.text);
  const ctx: ToolContext = {
    accountId: input.accountId,
    actorId: input.actorId ?? null,
    clientId: conversation.clientId,
  };
  let reply = await shortCircuit(ctx, input.text);
  if (!reply) reply = await optionalLlm(ctx, input.text);
  if (!reply) {
    reply = ctx.clientId
      ? `Não entendi. ${HELP}`
      : `Não achei seu cadastro pelo telefone desta conversa. Peça ao balcão para vincular.\n\n${HELP}`;
  }
  await appendMessage(input.accountId, conversation.id, "out", reply);
  return { conversationId: conversation.id, reply, clientId: conversation.clientId };
}
