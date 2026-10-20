import { FormError } from "@/catalog/errors";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import {
  bookAppointment,
  cancelAppointment,
  clientActivePackages,
  clientUpcomingAppointments,
  listOpenSlots,
} from "@/desk/booking";
import { dayParam } from "@/desk/clock";
import { db } from "@/db/client";
import { enterWaitlist, leaveWaitlist, listClientWaitlist } from "@/agent/waitlist";

export type ToolContext = {
  accountId: string;
  actorId: string | null;
  clientId: string | null;
};

export type ToolResult = { ok: true; text: string } | { ok: false; text: string };

function fail(error: unknown, fallback: string): ToolResult {
  if (error instanceof FormError) {
    const map: Record<string, string> = {
      dados: "Faltam dados para concluir.",
      hora: "Horário inválido.",
      ocupado: "Esse horário já está ocupado.",
      fechado: "Fora do expediente.",
      almoco: "Cai no almoço.",
      fechada: "A comanda do dia já está fechada.",
      cliente: "Cliente não encontrado.",
      fora: "Não encontrei esse horário.",
    };
    return { ok: false, text: map[error.code] ?? fallback };
  }
  return { ok: false, text: fallback };
}

async function resolveService(accountId: string, hint: string) {
  const q = hint.trim().toLowerCase();
  if (!q) return null;
  const rows = await db()<{ id: string; name: string }[]>`
    SELECT id, name FROM services
    WHERE account_id = ${accountId} AND active AND bookable
      AND (lower(name) = ${q} OR lower(name) LIKE ${`%${q}%`})
    ORDER BY length(name)
    LIMIT 5
  `;
  return rows;
}

async function resolveProfessional(accountId: string, hint: string) {
  const q = hint.trim().toLowerCase();
  if (!q) return null;
  return db()<{ id: string; name: string }[]>`
    SELECT id, COALESCE(NULLIF(nickname, ''), name) AS name
    FROM professionals
    WHERE account_id = ${accountId} AND active
      AND (lower(name) LIKE ${`%${q}%`} OR lower(COALESCE(nickname, '')) LIKE ${`%${q}%`})
    ORDER BY name
    LIMIT 5
  `;
}

export async function toolMeusHorarios(ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.clientId) return { ok: false, text: "Ainda não sei quem é você. Peça ao balcão para vincular esta conversa ao seu cadastro." };
  const rows = await clientUpcomingAppointments(ctx.accountId, ctx.clientId);
  if (!rows.length) return { ok: true, text: "Você não tem horários futuros marcados." };
  const lines = rows.map(
    (row) => `• ${formatDay(row.day)} ${row.start}–${row.end} · ${row.serviceName} com ${row.professionalName} (${row.status}) [${row.id.slice(0, 8)}]`,
  );
  return { ok: true, text: `Seus horários:\n${lines.join("\n")}` };
}

export async function toolMeusPacotes(ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.clientId) return { ok: false, text: "Ainda não sei quem é você. Peça ao balcão para vincular esta conversa." };
  const rows = await clientActivePackages(ctx.accountId, ctx.clientId, todaySaoPaulo());
  if (!rows.length) return { ok: true, text: "Você não tem pacote ativo com créditos." };
  const lines = rows.map((row) => {
    const left = row.total - row.used;
    const validade = row.validUntil
      ? row.started
        ? `válido até ${formatDay(row.validUntil)}`
        : `prazo começa na 1ª ida (limite ${formatDay(row.validUntil)})`
      : "sem validade definida";
    return `• ${row.name}: ${left} de ${row.total} créditos · ${validade}`;
  });
  return { ok: true, text: `Seus pacotes:\n${lines.join("\n")}` };
}

export async function toolVagas(
  ctx: ToolContext,
  args: { day: string; service: string; professional?: string | null },
): Promise<ToolResult> {
  try {
    const day = dayParam(args.day);
    const services = await resolveService(ctx.accountId, args.service);
    if (!services?.length) return { ok: false, text: "Não achei esse serviço. Diga o nome como está no cardápio." };
    if (services.length > 1) {
      return { ok: false, text: `Qual serviço?\n${services.map((s) => `• ${s.name}`).join("\n")}` };
    }
    let professionalId: string | null = null;
    if (args.professional) {
      const pros = await resolveProfessional(ctx.accountId, args.professional);
      if (!pros?.length) return { ok: false, text: "Não achei esse profissional." };
      if (pros.length > 1) {
        return { ok: false, text: `Qual profissional?\n${pros.map((p) => `• ${p.name}`).join("\n")}` };
      }
      professionalId = pros[0].id;
    }
    const slots = await listOpenSlots(ctx.accountId, day, services[0].id, professionalId);
    if (!slots.length) return { ok: true, text: `Sem vagas em ${formatDay(day)} para ${services[0].name}. Quer entrar na espera?` };
    const lines = slots.slice(0, 12).map(
      (slot) => `• ${slot.start}–${slot.end} com ${slot.professionalName}`,
    );
    return {
      ok: true,
      text: `Vagas em ${formatDay(day)} · ${services[0].name}:\n${lines.join("\n")}\n\nPara marcar: agendar ${day} ${slots[0].start} ${services[0].name}`,
    };
  } catch (error) {
    return fail(error, "Não consegui listar as vagas.");
  }
}

export async function toolAgendar(
  ctx: ToolContext,
  args: { day: string; start: string; service: string; professional?: string | null },
): Promise<ToolResult> {
  if (!ctx.clientId) return { ok: false, text: "Preciso do seu cadastro vinculado para agendar." };
  try {
    const day = dayParam(args.day);
    const start = args.start.slice(0, 5);
    const services = await resolveService(ctx.accountId, args.service);
    if (!services?.length) return { ok: false, text: "Serviço não encontrado." };
    if (services.length > 1) {
      return { ok: false, text: `Qual serviço?\n${services.map((s) => `• ${s.name}`).join("\n")}` };
    }
    let professionalId = "";
    if (args.professional) {
      const pros = await resolveProfessional(ctx.accountId, args.professional);
      if (!pros?.length) return { ok: false, text: "Profissional não encontrado." };
      if (pros.length > 1) {
        return { ok: false, text: `Qual profissional?\n${pros.map((p) => `• ${p.name}`).join("\n")}` };
      }
      professionalId = pros[0].id;
    } else {
      const slots = await listOpenSlots(ctx.accountId, day, services[0].id, null);
      const match = slots.find((slot) => slot.start === start);
      if (!match) return { ok: false, text: "Não há vaga nesse horário. Peça as vagas do dia." };
      professionalId = match.professionalId;
    }
    const booked = await bookAppointment({
      accountId: ctx.accountId,
      actorId: ctx.actorId,
      professionalId,
      serviceId: services[0].id,
      clientId: ctx.clientId,
      day,
      start,
    });
    return {
      ok: true,
      text: `Agendado: ${formatDay(booked.day)} ${booked.start}–${booked.end} · ${booked.serviceName}.`,
    };
  } catch (error) {
    return fail(error, "Não consegui agendar.");
  }
}

export async function toolCancelar(ctx: ToolContext, args: { appointmentId?: string; day?: string }): Promise<ToolResult> {
  if (!ctx.clientId) return { ok: false, text: "Preciso do seu cadastro vinculado para cancelar." };
  try {
    const upcoming = await clientUpcomingAppointments(ctx.accountId, ctx.clientId);
    let target = args.appointmentId
      ? upcoming.find((row) => row.id === args.appointmentId || row.id.startsWith(args.appointmentId!))
      : null;
    if (!target && args.day) {
      const day = dayParam(args.day);
      const onDay = upcoming.filter((row) => row.day === day);
      if (onDay.length === 1) target = onDay[0];
      else if (onDay.length > 1) {
        return {
          ok: false,
          text: `Há mais de um horário em ${formatDay(day)}:\n${onDay
            .map((row) => `• ${row.start} ${row.serviceName} [${row.id.slice(0, 8)}]`)
            .join("\n")}\nDiga o código entre colchetes.`,
        };
      }
    }
    if (!target && upcoming.length === 1) target = upcoming[0];
    if (!target) {
      if (!upcoming.length) return { ok: true, text: "Você não tem horário para cancelar." };
      return {
        ok: false,
        text: `Qual horário cancelar?\n${upcoming
          .map((row) => `• ${formatDay(row.day)} ${row.start} ${row.serviceName} [${row.id.slice(0, 8)}]`)
          .join("\n")}`,
      };
    }
    await cancelAppointment(ctx.accountId, ctx.actorId, target.id);
    return {
      ok: true,
      text: `Cancelado: ${formatDay(target.day)} ${target.start} · ${target.serviceName}.`,
    };
  } catch (error) {
    return fail(error, "Não consegui cancelar.");
  }
}

export async function toolRemarcar(
  ctx: ToolContext,
  args: { appointmentId?: string; day: string; start: string; service?: string; professional?: string | null },
): Promise<ToolResult> {
  if (!ctx.clientId) return { ok: false, text: "Preciso do seu cadastro vinculado para remarcar." };
  const upcoming = await clientUpcomingAppointments(ctx.accountId, ctx.clientId);
  let target = args.appointmentId
    ? upcoming.find((row) => row.id === args.appointmentId || row.id.startsWith(args.appointmentId!))
    : upcoming.length === 1
      ? upcoming[0]
      : null;
  if (!target) {
    return {
      ok: false,
      text: upcoming.length
        ? `Qual horário remarcar?\n${upcoming
            .map((row) => `• ${formatDay(row.day)} ${row.start} ${row.serviceName} [${row.id.slice(0, 8)}]`)
            .join("\n")}`
        : "Você não tem horário para remarcar.",
    };
  }
  const cancel = await toolCancelar(ctx, { appointmentId: target.id });
  if (!cancel.ok) return cancel;
  const book = await toolAgendar(ctx, {
    day: args.day,
    start: args.start,
    service: args.service ?? target.serviceName,
    professional: args.professional,
  });
  if (!book.ok) {
    return {
      ok: false,
      text: `${cancel.text}\nPorém a nova marcação falhou: ${book.text}`,
    };
  }
  return { ok: true, text: `Remarcado.\n${book.text}` };
}

export async function toolEntrarEspera(
  ctx: ToolContext,
  args: { day: string; service: string; professional?: string | null; note?: string | null },
): Promise<ToolResult> {
  if (!ctx.clientId) return { ok: false, text: "Preciso do seu cadastro vinculado para entrar na espera." };
  try {
    const services = await resolveService(ctx.accountId, args.service);
    if (!services?.length) return { ok: false, text: "Serviço não encontrado." };
    if (services.length > 1) {
      return { ok: false, text: `Qual serviço?\n${services.map((s) => `• ${s.name}`).join("\n")}` };
    }
    let professionalId: string | null = null;
    if (args.professional) {
      const pros = await resolveProfessional(ctx.accountId, args.professional);
      if (!pros?.length) return { ok: false, text: "Profissional não encontrado." };
      if (pros.length > 1) {
        return { ok: false, text: `Qual profissional?\n${pros.map((p) => `• ${p.name}`).join("\n")}` };
      }
      professionalId = pros[0].id;
    }
    await enterWaitlist({
      accountId: ctx.accountId,
      clientId: ctx.clientId,
      serviceId: services[0].id,
      professionalId,
      day: args.day,
      note: args.note,
    });
    return {
      ok: true,
      text: `Entrou na espera de ${formatDay(dayParam(args.day))} · ${services[0].name}. Avisamos se abrir vaga.`,
    };
  } catch (error) {
    return fail(error, "Não consegui colocar na espera.");
  }
}

export async function toolSairEspera(ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.clientId) return { ok: false, text: "Preciso do seu cadastro vinculado." };
  const rows = await listClientWaitlist(ctx.accountId, ctx.clientId);
  if (!rows.length) return { ok: true, text: "Você não está em nenhuma espera aberta." };
  await leaveWaitlist(ctx.accountId, ctx.clientId);
  return { ok: true, text: "Saí da lista de espera." };
}

export async function toolCatalogo(ctx: ToolContext): Promise<ToolResult> {
  const services = await db()<{ name: string; priceCents: number; durationMin: number }[]>`
    SELECT name, price_cents AS "priceCents", duration_min AS "durationMin"
    FROM services
    WHERE account_id = ${ctx.accountId} AND active AND bookable
    ORDER BY name
    LIMIT 30
  `;
  if (!services.length) return { ok: true, text: "Nenhum serviço bookable no momento." };
  const lines = services.map(
    (row) => `• ${row.name} · ${formatReais(row.priceCents)} · ${row.durationMin} min`,
  );
  return { ok: true, text: `Serviços:\n${lines.join("\n")}` };
}

export const TOOL_NAMES = [
  "meus_horarios",
  "meus_pacotes",
  "vagas",
  "agendar",
  "remarcar",
  "cancelar",
  "entrar_espera",
  "sair_espera",
  "catalogo",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export async function runTool(
  name: ToolName,
  ctx: ToolContext,
  args: Record<string, string | null | undefined>,
): Promise<ToolResult> {
  switch (name) {
    case "meus_horarios":
      return toolMeusHorarios(ctx);
    case "meus_pacotes":
      return toolMeusPacotes(ctx);
    case "vagas":
      return toolVagas(ctx, {
        day: String(args.day ?? ""),
        service: String(args.service ?? ""),
        professional: args.professional,
      });
    case "agendar":
      return toolAgendar(ctx, {
        day: String(args.day ?? ""),
        start: String(args.start ?? ""),
        service: String(args.service ?? ""),
        professional: args.professional,
      });
    case "remarcar":
      return toolRemarcar(ctx, {
        appointmentId: args.appointmentId ?? undefined,
        day: String(args.day ?? ""),
        start: String(args.start ?? ""),
        service: args.service ?? undefined,
        professional: args.professional,
      });
    case "cancelar":
      return toolCancelar(ctx, {
        appointmentId: args.appointmentId ?? undefined,
        day: args.day ?? undefined,
      });
    case "entrar_espera":
      return toolEntrarEspera(ctx, {
        day: String(args.day ?? ""),
        service: String(args.service ?? ""),
        professional: args.professional,
        note: args.note,
      });
    case "sair_espera":
      return toolSairEspera(ctx);
    case "catalogo":
      return toolCatalogo(ctx);
    default:
      return { ok: false, text: "Comando desconhecido." };
  }
}
