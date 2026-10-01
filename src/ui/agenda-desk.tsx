"use client";

import { useRef, useState } from "react";
import { fromMinutes } from "@/desk/clock";
import { BookForm } from "@/ui/book-form";

const HOUR = 56;

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
  const dialog = useRef<HTMLDialogElement>(null);
  const [pick, setPick] = useState<{ professional: string; start: string } | null>(null);

  function openAt(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("a, button, form, input, select")) return;
    const grid = target.closest<HTMLElement>("[data-pro]");
    const professional = grid?.dataset.pro;
    if (!grid || !professional) return;
    const bounds = grid.getBoundingClientRect();
    const raw = startMin + ((event.clientY - bounds.top) / HOUR) * 60;
    const snapped = Math.round(raw / 15) * 15;
    const clamped = Math.min(23 * 60 + 45, Math.max(0, snapped));
    setPick({ professional, start: fromMinutes(clamped) });
    dialog.current?.showModal();
  }

  return (
    <>
      <div onClick={openAt}>{children}</div>
      <dialog ref={dialog} className="modal">
        <header className="modal-head tone-blue">
          <h2>Novo horário</h2>
          <button type="button" className="btn quiet" onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </header>
        <div className="modal-body">
          {pick ? (
            <BookForm
              key={`${pick.professional}-${pick.start}`}
              day={day}
              lockedProfessional={lockedProfessional}
              initialProfessional={pick.professional}
              initialStart={pick.start}
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
