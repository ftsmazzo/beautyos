"use client";

import { useFormStatus } from "react-dom";

function toneClass(className?: string) {
  if (!className || className === "ghost" || className === "quiet") return "btn btn-outline";
  if (className === "teal" || className === "blue") return "btn btn-primary";
  if (className === "amber") return "btn btn-warning";
  if (className === "rose") return "btn btn-danger";
  if (className === "navy") return "btn btn-dark";
  if (className.includes("btn-outline")) return className.includes("btn ") ? className : `btn ${className}`;
  if (className.includes("btn-")) return className.startsWith("btn ") ? className : `btn ${className}`;
  return "btn btn-primary";
}

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
  return (
    <button type="submit" className={toneClass(className)} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}
