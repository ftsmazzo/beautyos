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
  const openClass =
    tone === "amber" || tone === "rose" || tone === "navy"
      ? tone === "amber"
        ? "btn btn-warning"
        : tone === "rose"
          ? "btn btn-danger"
          : "btn btn-dark"
      : "btn btn-primary";

  return (
    <>
      <button type="button" className={openClass} onClick={() => dialog.current?.showModal()}>
        {label}
      </button>
      <dialog ref={dialog} className="bos-dialog">
        <header className={`bos-dialog-head tone-${tone}`}>
          <h2>{title}</h2>
          <button type="button" className="btn btn-outline" onClick={() => dialog.current?.close()}>
            Fechar
          </button>
        </header>
        <div className="bos-dialog-body">{children}</div>
      </dialog>
    </>
  );
}
