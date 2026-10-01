"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { blockSlot, dropBlock, flipEncaixe, paintSlot, placeAppointment } from "@/desk/actions";
import { fromMinutes, minutes } from "@/desk/clock";
import { BookForm } from "@/ui/book-form";
import { SubmitButton } from "@/ui/submit-button";

const HOUR = 56;

type EmptyMenu = { kind: "empty"; x: number; y: number; professionalId: string; start: string };
type SlotMenu = {
  kind: "slot";
  x: number;
  y: number;
  id: string;
  orderId: string;
  status: string;
  encaixe: boolean;
  block: boolean;
};
type Menu = EmptyMenu | SlotMenu;

type Drag = {
  pointerId: number;
  mode: "move" | "resize";
  startX: number;
  startY: number;
  originTop: number;
  originHeight: number;
  moved: boolean;
  slot: HTMLElement;
  professionalId: string;
};

export function AgendaDesk({
  day,
  startMin,
  lockedProfessional,
  professionals,
  services,
  clients,
  children,
}: {
  day: string;
  startMin: number;
  lockedProfessional: string | null;
  professionals: { id: string; name: string }[];
  services: { id: string; name: string; professionalIds: string[] }[];
  clients: { id: string; name: string }[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const drag = useRef<Drag | null>(null);
  const skipClick = useRef(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [note, setNote] = useState("");
  const [pick, setPick] = useState<{ professional: string; start: string; encaixe: boolean; block: boolean } | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function timeAt(grid: HTMLElement, clientY: number) {
    const y = clientY - grid.getBoundingClientRect().top;
    const raw = startMin + (y / HOUR) * 60;
    const snapped = Math.round(raw / 15) * 15;
    return fromMinutes(Math.min(23 * 60 + 45, Math.max(0, snapped)));
  }

  function openEmpty(event: { clientX: number; clientY: number }, grid: HTMLElement) {
    const professionalId = grid.dataset.pro;
    if (!professionalId) return;
    setMenu({ kind: "empty", x: event.clientX, y: event.clientY, professionalId, start: timeAt(grid, event.clientY) });
  }

  function openSlot(event: { clientX: number; clientY: number }, slot: HTMLElement) {
    setMenu({
      kind: "slot",
      x: event.clientX,
      y: event.clientY,
      id: slot.dataset.slot ?? "",
      orderId: slot.dataset.order ?? "",
      status: slot.dataset.status ?? "",
      encaixe: slot.dataset.encaixe === "1",
      block: slot.dataset.kind === "bloqueio",
    });
  }

  function onClick(event: React.MouseEvent<HTMLDivElement>) {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    const target = event.target as HTMLElement;
    if (target.closest("a, button, form, input, select, .agenda-menu")) return;
    const slot = target.closest<HTMLElement>("[data-slot]");
    if (slot) {
      openSlot(event, slot);
      return;
    }
    const grid = target.closest<HTMLElement>("[data-pro]");
    if (grid) openEmpty(event, grid);
  }

  function onContextMenu(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const slot = target.closest<HTMLElement>("[data-slot]");
    const grid = target.closest<HTMLElement>("[data-pro]");
    if (!slot && !grid) return;
    event.preventDefault();
    if (slot) openSlot(event, slot);
    else if (grid) openEmpty(event, grid);
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    const slot = target.closest<HTMLElement>("[data-slot]");
    if (!slot || target.closest("button, form, input, select")) return;
    const grid = slot.closest<HTMLElement>("[data-pro]");
    drag.current = {
      pointerId: event.pointerId,
      mode: target.closest("[data-resize]") ? "resize" : "move",
      startX: event.clientX,
      startY: event.clientY,
      originTop: slot.offsetTop,
      originHeight: slot.offsetHeight,
      moved: false,
      slot,
      professionalId: grid?.dataset.pro ?? "",
    };
    slot.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const session = drag.current;
    if (!session || event.pointerId !== session.pointerId) return;
    const dy = event.clientY - session.startY;
    if (!session.moved && Math.hypot(event.clientX - session.startX, dy) < 6) return;
    session.moved = true;
    session.slot.style.zIndex = "5";
    if (session.mode === "resize") {
      session.slot.style.height = `${Math.max(18, session.originHeight + dy)}px`;
      return;
    }
    session.slot.style.top = `${session.originTop + dy}px`;
    session.slot.style.pointerEvents = "none";
    const under = document.elementFromPoint(event.clientX, event.clientY);
    session.slot.style.pointerEvents = "";
    const grid = under?.closest<HTMLElement>("[data-pro]");
    if (grid && grid !== session.slot.parentElement) grid.appendChild(session.slot);
  }

  async function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const session = drag.current;
    if (!session || event.pointerId !== session.pointerId) return;
    drag.current = null;
    if (!session.moved) return;
    skipClick.current = true;
    const grid = session.slot.closest<HTMLElement>("[data-pro]");
    const professionalId = grid?.dataset.pro || session.professionalId;
    const startTotal = startMin + Math.round(((session.slot.offsetTop / HOUR) * 60) / 15) * 15;
    const duration = Math.max(15, Math.round(((session.slot.offsetHeight / HOUR) * 60) / 15) * 15);
    const start = fromMinutes(Math.max(0, Math.min(startTotal, 23 * 60)));
    const end = fromMinutes(Math.min(24 * 60, Math.max(minutes(start) + 15, startTotal + duration)));
    const result = await placeAppointment({ id: session.slot.dataset.slot ?? "", professionalId, start, end });
    if (!result.ok) setNote(result.error);
    router.refresh();
  }

  async function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    const result = await work();
    if (!result.ok) setNote(result.error);
    setMenu(null);
    router.refresh();
  }

  function choose(encaixe: boolean, block: boolean) {
    if (menu?.kind !== "empty") return;
    setPick({ professional: menu.professionalId, start: menu.start, encaixe, block });
    setMenu(null);
    dialog.current?.showModal();
  }

  const menuStyle = menu
    ? {
        left: Math.max(8, Math.min(menu.x, typeof window === "undefined" ? menu.x : window.innerWidth - 240)),
        top: Math.max(8, Math.min(menu.y, typeof window === "undefined" ? menu.y : window.innerHeight - 320)),
      }
    : undefined;

  return (
    <>
      <div ref={root} onClick={onClick} onContextMenu={onContextMenu} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {children}
      </div>
      {note ? <p className="error banner">{note}</p> : null}
      {menu ? (
        <div className="agenda-menu" style={menuStyle} role="menu" onClick={(event) => event.stopPropagation()}>
          {menu.kind === "empty" ? (
            <>
              <button type="button" onClick={() => choose(false, false)}>Agendar</button>
              <button type="button" onClick={() => choose(true, false)}>Encaixe</button>
              <button type="button" onClick={() => choose(false, true)}>Bloquear</button>
            </>
          ) : menu.block ? (
            <button type="button" onClick={() => run(() => dropBlock({ id: menu.id }))}>Remover bloqueio</button>
          ) : (
            <>
              {menu.orderId ? (
                <button type="button" onClick={() => router.push(`/comandas/${menu.orderId}`)}>Abrir comanda</button>
              ) : null}
              {(["confirmado", "chegou", "em_atendimento", "realizado", "ausente", "cancelado"] as const)
                .filter((status) => status !== menu.status)
                .map((status) => (
                  <button key={status} type="button" onClick={() => run(() => paintSlot({ id: menu.id, status }))}>
                    {status === "confirmado" ? "Confirmar" : status === "chegou" ? "Chegou" : status === "em_atendimento" ? "Em atendimento" : status === "realizado" ? "Realizado" : status === "ausente" ? "Ausente" : "Cancelar"}
                  </button>
                ))}
              <button type="button" onClick={() => run(() => flipEncaixe({ id: menu.id }))}>
                {menu.encaixe ? "Tirar encaixe" : "Marcar encaixe"}
              </button>
            </>
          )}
        </div>
      ) : null}
      <dialog ref={dialog} className="modal">
        <header className="modal-head tone-blue">
          <h2>{pick?.block ? "Bloquear" : pick?.encaixe ? "Encaixe" : "Novo horário"}</h2>
          <button type="button" className="btn quiet" onClick={() => dialog.current?.close()}>Fechar</button>
        </header>
        <div className="modal-body">
          {pick?.block ? (
            <form action={blockSlot}>
              <input type="hidden" name="day" value={day} />
              <input type="hidden" name="professional" value={lockedProfessional ?? pick.professional} />
              <div className="split">
                <label>
                  Início
                  <input name="start" type="time" required defaultValue={pick.start} />
                </label>
                <label>
                  Fim
                  <input name="end" type="time" required defaultValue={fromMinutes(Math.min(23 * 60 + 45, minutes(pick.start) + 60))} />
                </label>
              </div>
              <SubmitButton label="Bloquear" pendingLabel="Bloqueando…" />
            </form>
          ) : pick ? (
            <BookForm
              key={`${pick.professional}-${pick.start}-${pick.encaixe}`}
              day={day}
              lockedProfessional={lockedProfessional}
              initialProfessional={pick.professional}
              initialStart={pick.start}
              initialEncaixe={pick.encaixe}
              professionals={professionals}
              services={services}
              clients={clients}
            />
          ) : null}
        </div>
      </dialog>
    </>
  );
}
