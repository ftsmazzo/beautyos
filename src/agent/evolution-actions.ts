"use server";

import { requireAdmin } from "@/catalog/access";
import {
  linkEvolutionInstance,
  refreshEvolutionPairing,
  requestEvolutionQr,
  startEvolutionPairing,
  type EvolutionConnectionView,
} from "@/agent/evolution/connection";

export type EvolutionActionResult =
  | { ok: true; data: EvolutionConnectionView }
  | { ok: false; error: string };

export async function startEvolutionPairingAction(): Promise<EvolutionActionResult> {
  const user = await requireAdmin();
  try {
    const data = await startEvolutionPairing(user.accountId, user.accountName);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao parear" };
  }
}

export async function refreshEvolutionAction(): Promise<EvolutionActionResult> {
  const user = await requireAdmin();
  try {
    const data = await refreshEvolutionPairing(user.accountId, user.accountName);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao atualizar status" };
  }
}

export async function requestEvolutionQrAction(): Promise<EvolutionActionResult> {
  const user = await requireAdmin();
  try {
    const data = await requestEvolutionQr(user.accountId, user.accountName);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao gerar QR" };
  }
}

export async function linkEvolutionAction(instanceName: string): Promise<EvolutionActionResult> {
  const user = await requireAdmin();
  try {
    await linkEvolutionInstance(user.accountId, instanceName);
    const data = await refreshEvolutionPairing(user.accountId, user.accountName);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha ao vincular" };
  }
}
