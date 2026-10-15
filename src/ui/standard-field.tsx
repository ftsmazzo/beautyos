"use client";

import { useState } from "react";
import { parseReais } from "@/catalog/format";

function sameNumber(mode: "reais" | "int", left: string, right: string) {
  if (mode === "reais") {
    const a = parseReais(left);
    const b = parseReais(right);
    return a != null && a === b;
  }
  const a = Number(left.trim().replace("%", "").replace(",", "."));
  const b = Number(right.trim().replace("%", "").replace(",", "."));
  return Number.isFinite(a) && a === b;
}

export function StandardField({
  name,
  standard,
  stored,
  mode,
  label,
}: {
  name: string;
  standard: string;
  stored: string;
  mode: "reais" | "int";
  label: string;
}) {
  const follows = stored.trim() === "" || sameNumber(mode, stored, standard);
  const [text, setText] = useState(follows ? standard : stored);
  const [mark, setMark] = useState(follows);

  function follow(next: string) {
    return next.trim() === "" || sameNumber(mode, next, standard);
  }

  return (
    <span className="standard-field">
      <input
        name={name}
        inputMode={mode === "reais" ? "decimal" : "numeric"}
        aria-label={label}
        value={text}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          setMark(follow(next));
        }}
        onBlur={() => {
          if (!follow(text)) return;
          setText(standard);
          setMark(true);
        }}
      />
      {mark ? <span className="standard-mark">padrão</span> : null}
    </span>
  );
}
