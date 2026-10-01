"use client";

import { useRef } from "react";

export function Modal({
  label,
  title,
  tone = "navy",
  children,
}: {
  label: string;
  title: string;
  tone?: "navy" | "teal" | "amber" | "rose" | "blue";
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={`btn ${tone}`} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <dialog ref={dialog} className="modal">
        <header className={`modal-head tone-${tone}`}>
          <h2>{title}</h2>
          <button type="button" className="btn quiet" onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </dialog>
    </>
  );
}
