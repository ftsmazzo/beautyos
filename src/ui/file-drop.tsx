"use client";

import { useId, useState } from "react";

export function FileDrop({
  name,
  accept,
  required,
  label = "Arraste o arquivo ou clique para escolher",
  hint = "XML ou PDF da nota",
}: {
  name: string;
  accept?: string;
  required?: boolean;
  label?: string;
  hint?: string;
}) {
  const id = useId();
  const [fileName, setFileName] = useState("");
  const [over, setOver] = useState(false);

  return (
    <label
      className={`file-drop${over ? " is-over" : ""}${fileName ? " has-file" : ""}`}
      htmlFor={id}
      onDragEnter={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={() => setOver(false)}
    >
      <span className="file-drop-icon" aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M12 16V7" />
          <path d="M8.5 10.5 12 7l3.5 3.5" />
          <path d="M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5" />
        </svg>
      </span>
      <span className="file-drop-copy">
        <strong>{fileName || label}</strong>
        <small>{fileName ? "Clique para trocar" : hint}</small>
      </span>
      <input
        id={id}
        className="file-drop-input"
        name={name}
        type="file"
        accept={accept}
        required={required}
        onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
      />
    </label>
  );
}
