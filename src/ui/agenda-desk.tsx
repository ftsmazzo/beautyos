"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { blockSlot, dropBlock, flipEncaixe, paintSlot, placeAppointment } from "@/desk/actions";
import { fromMinutes, minutes } from "@/desk/clock";
import { BookForm } from "@/ui/book-form";
import { SubmitButton } from "@/ui/submit-button";

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
  validTop: number;
  validHeight: number;
  validParent: HTMLElement | null;
  originParent: HTMLElement | null;
  moved: boolean;
  slot: HTMLElement;
  professionalId: string;
};

type Tip = { left: number; top: number; name: string; lines: string[] };

export function AgendaDesk({
  day,
  startMin,
  hourPx,
  lockedProfessional,
  professionals,
  services,
  clients,
  children,
}: {
  day: string;
  startMin: number;
  hourPx: number;
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
  const [tip, setTip] = useState<Tip | null>(null);
  const [pick, setPick] = useState<{ professional: string; start: string; encaixe: boolean; block: boolean } | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function minutePx() {
    return hourPx / 60;
  }

  function obstacles(column: HTMLElement, self: HTMLElement) {
    return [...column.querySelectorAll<HTMLElement>("[data-slot]")]
      .filter((el) => el !== self && el.dataset.status !== "cancelado")
      .map((el) => ({ top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight }));
  }

  function overlaps(top: number, height: number, blocks: { top: number; bottom: number }[]) {
    const bottom = top + height;
    return blocks.some((block) => top < block.bottom - 0.5 && bottom > block.top + 0.5);
  }

  function settleTop(desired: number, height: number, blocks: { top: number; bottom: number }[]) {
    let top = Math.max(0, desired);
    for (let pass = 0; pass < 8; pass += 1) {
      const hit = blocks.find((block) => top < block.bottom - 0.5 && top + height > block.top + 0.5);
      if (!hit) return top;
      const above = Math.max(0, hit.top - height);
      const below = hit.bottom;
      const next = Math.abs(desired - above) <= Math.abs(desired - below) ? above : below;
      if (Math.abs(next - top) < 0.5) return top;
      top = next;
    }
    return top;
  }

  function settleHeight(top: number, desired: number, blocks: { top: number; bottom: number }[]) {
    const min = minutePx() * 15;
    const height = Math.max(min, desired);
    const hit = blocks
      .filter((block) => block.top > top + 0.5 && top + height > block.top + 0.5)
      .sort((a, b) => a.top - b.top)[0];
    if (!hit) return height;
    return Math.max(min, hit.top - top);
  }

  function timeAt(grid: HTMLElement, clientY: number) {
    const y = clientY - grid.getBoundingClientRect().top;
    const raw = startMin + (y / hourPx) * 60;
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
    slot.dataset.dragStart = String(startMin + Math.round(slot.offsetTop / minutePx()));
    slot.dataset.dragMinutes = String(Math.max(15, Math.round(slot.offsetHeight / minutePx())));
    drag.current = {
      pointerId: event.pointerId,
      mode: target.closest("[data-resize]") ? "resize" : "move",
      startX: event.clientX,
      startY: event.clientY,
      originTop: slot.offsetTop,
      originHeight: slot.offsetHeight,
      validTop: slot.offsetTop,
      validHeight: slot.offsetHeight,
      validParent: slot.parentElement,
      originParent: slot.parentElement,
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
    setTip(null);
    session.slot.style.zIndex = "5";
    const step = minutePx();
    const free = session.slot.dataset.encaixe === "1";
    if (session.mode === "resize") {
      const column = session.slot.parentElement;
      const desired = Math.round((session.originHeight + dy) / step) * step;
      const blocks = column && !free ? obstacles(column, session.slot) : [];
      const height = free ? Math.max(step * 15, desired) : settleHeight(session.slot.offsetTop, desired, blocks);
      if (free || !column || !overlaps(session.slot.offsetTop, height, blocks)) {
        session.validHeight = height;
        session.slot.style.height = `${height}px`;
        session.slot.dataset.dragMinutes = String(Math.max(15, Math.round(height / step)));
      }
      return;
    }
    session.slot.style.pointerEvents = "none";
    const under = document.elementFromPoint(event.clientX, event.clientY);
    session.slot.style.pointerEvents = "";
    const grid = under?.closest<HTMLElement>("[data-pro]");
    if (grid && grid !== session.slot.parentElement) grid.appendChild(session.slot);
    const column = session.slot.parentElement;
    const limit = Math.max(0, (column?.clientHeight ?? session.originTop) - session.slot.offsetHeight);
    const desired = Math.min(limit, Math.max(0, Math.round((session.originTop + dy) / step) * step));
    const blocks = column && !free ? obstacles(column, session.slot) : [];
    const top = free || !column ? desired : settleTop(desired, session.slot.offsetHeight, blocks);
    if (free || !column || !overlaps(top, session.slot.offsetHeight, blocks)) {
      session.validTop = top;
      session.validParent = column;
      session.slot.style.top = `${top}px`;
      session.slot.dataset.dragStart = String(startMin + Math.round(top / step));
    } else {
      if (session.validParent && session.slot.parentElement !== session.validParent) {
        session.validParent.appendChild(session.slot);
      }
      session.slot.style.top = `${session.validTop}px`;
    }
  }

  async function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const session = drag.current;
    if (!session || event.pointerId !== session.pointerId) return;
    drag.current = null;
    if (!session.moved) return;
    skipClick.current = true;
    const grid = session.slot.closest<HTMLElement>("[data-pro]");
    const professionalId = grid?.dataset.pro || session.professionalId;
    const startTotal = Math.max(0, Math.min(23 * 60, Number(session.slot.dataset.dragStart) || startMin));
    const duration = Math.max(15, Number(session.slot.dataset.dragMinutes) || 15);
    const endTotal = Math.min(23 * 60 + 59, Math.max(startTotal + 15, startTotal + duration));
    const start = fromMinutes(startTotal);
    const end = fromMinutes(endTotal);
    const result = await placeAppointment({ id: session.slot.dataset.slot ?? "", professionalId, start, end });
    if (!result.ok) {
      if (session.originParent && session.slot.parentElement !== session.originParent) {
        session.originParent.appendChild(session.slot);
      }
      session.slot.style.top = `${session.originTop}px`;
      session.slot.style.height = `${session.originHeight}px`;
      setNote(result.error);
    }
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

  function showTip(slot: HTMLElement) {
    const rect = slot.getBoundingClientRect();
    const width = 260;
    const height = 168;
    let left = rect.left;
    let top = rect.bottom + 8;
    if (left + width > window.innerWidth - 12) left = window.innerWidth - width - 12;
    if (left < 12) left = 12;
    if (top + height > window.innerHeight - 12) top = Math.max(12, rect.top - height - 8);
    const lines = [slot.dataset.phone, slot.dataset.service, slot.dataset.when, slot.dataset.word, slot.dataset.extra].filter(
      (line): line is string => Boolean(line),
    );
    setTip({
      left,
      top,
      name: slot.dataset.name || "Horário",
      lines,
    });
  }

  function onOver(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.moved) return;
    const slot = (event.target as HTMLElement).closest<HTMLElement>("[data-slot]");
    if (!slot) return;
    showTip(slot);
  }

  function onOut(event: React.PointerEvent<HTMLDivElement>) {
    const next = event.relatedTarget as HTMLElement | null;
    if (next?.closest?.("[data-slot]")) return;
    setTip(null);
  }

  const menuStyle = menu
    ? {
        left: Math.max(8, Math.min(menu.x, typeof window === "undefined" ? menu.x : window.innerWidth - 240)),
        top: Math.max(8, Math.min(menu.y, typeof window === "undefined" ? menu.y : window.innerHeight - 320)),
      }
    : undefined;

  return (
    <>
      <div
        ref={root}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerOver={onOver}
        onPointerOut={onOut}
      >
        {children}
      </div>
      {tip ? (
        <div className="slot-card" style={{ left: tip.left, top: tip.top }}>
          <strong>{tip.name}</strong>
          {tip.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      ) : null}
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
