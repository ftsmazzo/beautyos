"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  label,
  pendingLabel = "Salvando…",
  className,
}: {
  label: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  const tone = className === "ghost" ? "quiet" : className;
  const classes = ["btn", tone].filter(Boolean).join(" ");
  return (
    <button type="submit" className={classes} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
