"use client";

import { useEffect, useRef } from "react";

export function Modal({
  label,
  title,
  tone = "navy",
  startOpen = false,
  children,
}: {
  label: string;
  title: string;
  tone?: "navy" | "teal" | "amber" | "rose" | "blue";
  startOpen?: boolean;
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (startOpen) dialog.current?.showModal();
  }, [startOpen]);
  return (
    <>
      <button type="button" className={`btn ${tone}`} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <dialog ref={dialog} className="modal">
        <header className={`modal-head tone-${tone}`}>
          <h2>{title}</h2>
          <button type="button" className="btn btn-outline" onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </dialog>
    </>
  );
}
