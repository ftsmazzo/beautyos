"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { InvoiceDraft } from "@/catalog/invoice";
import { FORM_ERRORS } from "@/catalog/labels";
import { readCoupon, readInvoice } from "@/catalog/product-actions";
import { CouponScan } from "@/ui/coupon-scan";
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
  seed?: InvoiceDraft | null;
  seedNote?: string;
  lowCount?: number;
};

export function PurchaseLaunch(props: LaunchProps) {
  const [draft, setDraft] = useState<InvoiceDraft | null>(props.seed ?? null);
  const [token, setToken] = useState(props.seed ? 1 : 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState("");
  const pending = draft?.lines.filter((line) => !line.productId).length ?? 0;
  const openDraft = useCallback((next: InvoiceDraft) => {
    setToken((current) => current + 1);
    setDraft(next);
  }, []);
  const onCoupon = useCallback(async (payload: string) => {
    setError("");
    if (!payload) {
      setError(FORM_ERRORS.cupom);
      return;
    }
    setBusy(true);
    const result = await readCoupon(payload);
    setBusy(false);
    if (!result.ok) {
      setError(FORM_ERRORS[result.error] ?? FORM_ERRORS.consulta);
      return;
    }
    openDraft(result.draft);
  }, [openDraft]);
  const onShot = useCallback((shot: { qr: string; photo: string }) => {
    setPhoto(shot.photo);
    void onCoupon(shot.qr);
  }, [onCoupon]);
  const form = <PurchaseForm {...props} />;
  return (
    <>
      <div className="desk-bar">
        <Link className="btn quiet" href="/produtos">Produtos</Link>
        {props.products.length > 0 ? (
          <CouponScan busy={busy} onShot={onShot} />
        ) : null}
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
              openDraft(result.draft);
            }}
          >
            <label>
              XML ou PDF
              <input name="file" type="file" accept=".xml,.pdf,application/pdf,text/xml" required />
            </label>
            <SubmitButton label="Ler nota" pendingLabel="Lendo…" />
          </form>
        ) : null}
        {props.products.length > 0 ? (
          <Modal label="Lançar nota" title="Lançar nota" tone="teal">{form}</Modal>
        ) : null}
        {(props.lowCount ?? 0) > 0 ? (
          <Link className="btn quiet" href="/produtos/compra?pedir=1">
            Lista de compra · {props.lowCount}
          </Link>
        ) : null}
        <span className="chip">{props.purchaseCount} notas</span>
      </div>
      {error ? <p className="desk-alert">{error}</p> : null}
      {photo ? <img className="coupon-shot" alt="Cupom enviado pelo celular" src={photo} /> : null}
      {draft ? (
        <Modal key={token} label="Nota lida" title={props.seedNote ? "Lista de compra" : "Confira a nota"} tone="teal" startOpen>
          <p className="desk-alert">
            {props.seedNote ? `${props.seedNote} ` : ""}
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
