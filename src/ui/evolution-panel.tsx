"use client";

import { useEffect, useState, useTransition } from "react";
import {
  linkEvolutionAction,
  refreshEvolutionAction,
  requestEvolutionQrAction,
  startEvolutionPairingAction,
} from "@/agent/evolution-actions";
import type { EvolutionConnectionView } from "@/agent/evolution/connection";
import { formatPhone } from "@/catalog/format";

export function EvolutionPanel({ initial }: { initial: EvolutionConnectionView }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [linkName, setLinkName] = useState(
    initial.openAvailableInstances[0] ?? initial.availableInstances[0] ?? initial.suggestedInstanceName,
  );
  const [pending, startTransition] = useTransition();
  const connected = state.status === "connected";

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      if (document.visibilityState !== "visible") return;
      const result = await refreshEvolutionAction();
      if (cancelled || !result.ok) return;
      setState(result.data);
    }
    void tick();
    const id = window.setInterval(() => void tick(), connected ? 30_000 : 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [connected]);

  function run(action: () => Promise<{ ok: true; data: EvolutionConnectionView } | { ok: false; error: string }>, okMsg: string) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setState(result.data);
      setNote(okMsg);
    });
  }

  return (
    <div className="queue stack">
      <div className="desk-bar">
        <span className="day-label">WhatsApp</span>
        <span className={`agent-pill ${connected ? "ok" : state.status === "pairing" ? "warn" : "mute"}`}>
          {connected ? "Conectado" : state.status === "pairing" ? "QR" : "Off"}
        </span>
        {state.instanceName ? <span className="chip">{state.instanceName}</span> : null}
        {state.phoneE164 ? <span className="chip">{formatPhone(state.phoneE164)}</span> : null}
      </div>

      {!state.configured ? (
        <p className="queue-empty">Sem Evolution neste servidor. O simulador continua na inbox.</p>
      ) : (
        <>
          {state.webhookHint ? <span className="chip">{state.webhookHint}</span> : null}

          {state.qrcodeBase64 ? (
            <div className="agent-qr">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.qrcodeBase64} alt="QR Code WhatsApp" width={220} height={220} />
            </div>
          ) : null}

          <div className="row">
            <button
              type="button"
              className="btn"
              disabled={pending || !state.configured}
              onClick={() => run(startEvolutionPairingAction, "Pareamento iniciado.")}
            >
              Criar / parear
            </button>
            <button
              type="button"
              className="btn quiet"
              disabled={pending || !state.configured}
              onClick={() => run(requestEvolutionQrAction, "QR atualizado.")}
            >
              Gerar QR
            </button>
            <button
              type="button"
              className="btn quiet"
              disabled={pending || !state.configured}
              onClick={() => run(refreshEvolutionAction, "Status atualizado.")}
            >
              Atualizar status
            </button>
          </div>

          <div className="row">
            <label>
              Vincular instância existente
              <input
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                list="evolution-instances"
                placeholder={state.suggestedInstanceName}
              />
              <datalist id="evolution-instances">
                {state.availableInstances.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <button
              type="button"
              className="btn quiet"
              disabled={pending || !linkName.trim()}
              onClick={() =>
                run(() => linkEvolutionAction(linkName.trim()), "Instância vinculada à casa.")
              }
            >
              Vincular
            </button>
          </div>
        </>
      )}

      {error ? <p className="error banner">{error}</p> : null}
      {note ? <p className="ok banner">{note}</p> : null}
    </div>
  );
}
