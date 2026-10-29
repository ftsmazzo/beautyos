"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/ui/modal";

const COLUMNS = [
  { id: "telefone", label: "Telefone" },
  { id: "pacote", label: "Pacote" },
  { id: "idas", label: "Idas" },
  { id: "proxima", label: "Próxima" },
  { id: "prazo", label: "Prazo" },
  { id: "pago", label: "Pago" },
] as const;

type ColumnId = (typeof COLUMNS)[number]["id"];

const STORAGE = "beautyos.sold-columns";

export type SoldColumnRow = {
  id: string;
  clientName: string;
  phone: string;
  name: string;
  visits: string;
  nextVisit: string;
  situation: string;
  paid: string;
};

function storedHidden(): ColumnId[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE);
  if (!raw) return [];
  const known = new Set<string>(COLUMNS.map((column) => column.id));
  return raw.split(",").filter((id): id is ColumnId => known.has(id));
}

export function SoldColumns({ rows }: { rows: SoldColumnRow[] }) {
  const [hidden, setHidden] = useState<ColumnId[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setHidden(storedHidden());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE, hidden.join(","));
  }, [hidden, ready]);

  function shown(id: ColumnId) {
    return !hidden.includes(id);
  }

  function toggle(id: ColumnId) {
    setHidden(shown(id) ? [...hidden, id] : hidden.filter((item) => item !== id));
  }

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            {shown("telefone") ? <th>Telefone</th> : null}
            {shown("pacote") ? <th>Pacote</th> : null}
            {shown("idas") ? <th>Idas</th> : null}
            {shown("proxima") ? <th>Próxima</th> : null}
            {shown("prazo") ? <th>Prazo</th> : null}
            {shown("pago") ? <th>Pago</th> : null}
            <th>
              <Modal label="Colunas" title="Colunas" tone="navy">
                {COLUMNS.map((column) => (
                  <label key={column.id} className="check">
                    <input type="checkbox" checked={shown(column.id)} onChange={() => toggle(column.id)} />
                    {column.label}
                  </label>
                ))}
                <div className="bos-row">
                  <button type="button" className="btn btn-outline" onClick={() => setHidden(COLUMNS.map((column) => column.id))}>
                    Só o nome
                  </button>
                  <button type="button" className="btn btn-outline" onClick={() => setHidden([])}>
                    Todas
                  </button>
                </div>
              </Modal>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.clientName}</td>
              {shown("telefone") ? <td>{row.phone}</td> : null}
              {shown("pacote") ? <td>{row.name}</td> : null}
              {shown("idas") ? <td>{row.visits}</td> : null}
              {shown("proxima") ? <td>{row.nextVisit}</td> : null}
              {shown("prazo") ? <td>{row.situation}</td> : null}
              {shown("pago") ? <td>{row.paid}</td> : null}
              <td>
                <Link href={`/pacotes/vendidos/${row.id}`}>Ver</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
