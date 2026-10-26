"use client";

import { useState } from "react";
import Link from "next/link";
import type { InvoiceDraft } from "@/catalog/invoice";
import { FORM_ERRORS } from "@/catalog/labels";
import { readInvoice } from "@/catalog/product-actions";
import { Modal } from "@/ui/modal";
import { PurchaseForm } from "@/ui/purchase-form";
import { SubmitButton } from "@/ui/submit-button";

type LaunchProps = {
  purchaseCount: number;
  products: { id: string; name: string; supplierId: string | null }[];
  suppliers: { id: string; name: string; city: string | null }[];
  banks: { id: string; name: string }[];
  cards: { id: string; name: string }[];
  charts: { id: string; code: string; name: string }[];
  aliases: { supplierId: string; label: string; productId: string; productName: string }[];
  today: string;
};

export function PurchaseLaunch(props: LaunchProps) {
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [token, setToken] = useState(0);
  const [error, setError] = useState("");
  const pending = draft?.lines.filter((line) => !line.productId).length ?? 0;
  const form = <PurchaseForm {...props} />;
  return (
    <>
      <div className="desk-bar">
        <Link className="btn quiet" href="/produtos">Produtos</Link>
        {props.products.length > 0 ? (
          <form
            className="desk-bar"
            style={{ margin: 0 }}
            action={async (formData) => {
              setError("");
              const result = await readInvoice(formData);
              if (!result.ok) {
                setError(FORM_ERRORS[result.error] ?? FORM_ERRORS.leitura);
                return;
              }
              setToken((current) => current + 1);
              setDraft(result.draft);
            }}
          >
            <label>
              Arquivo
              <input name="file" type="file" accept=".xml,.pdf,image/jpeg,image/png,image/webp" required />
            </label>
            <SubmitButton label="Ler nota" pendingLabel="Lendo…" />
          </form>
        ) : null}
        {props.products.length > 0 ? (
          <Modal label="Lançar nota" title="Lançar nota" tone="teal">{form}</Modal>
        ) : null}
        <span className="chip">{props.purchaseCount} notas</span>
      </div>
      {error ? <p className="desk-alert">{error}</p> : null}
      {draft ? (
        <Modal key={token} label="Nota lida" title="Confira a nota" tone="teal" startOpen>
          <p className="desk-alert">
            {draft.lines.length === 0 ? "A leitura não trouxe itens. " : ""}
            {pending > 0 ? `${pending} sem produto. ` : ""}
            Confira antes de lançar.
          </p>
          <PurchaseForm {...props} draft={draft} />
        </Modal>
      ) : null}
    </>
  );
}
