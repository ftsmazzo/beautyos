import { fetchCoupon, parseCouponPage, rawFromCouponText } from "@/catalog/invoice";
import { couponUrl } from "@/catalog/coupon-qr";

type RawLine = { label: string; qty: number; costCents: number; barcode: string };
type RawInvoice = {
  supplierName: string;
  cnpj: string;
  document: string;
  day: string;
  lines: RawLine[];
};

export type LookupResult = {
  invoice: RawInvoice | null;
  /** Proxy configurado mas sem itens (rede/WAF/timeout/parse). */
  proxyFailed: boolean;
};

function normalizeLines(
  rows: { label?: string; qty?: number; costCents?: number; unitCents?: number; barcode?: string }[] | undefined,
): RawLine[] {
  return (rows ?? [])
    .map((line) => ({
      label: String(line.label ?? "").trim().slice(0, 120),
      qty: Math.max(1, Math.round(Number(line.qty) || 1)),
      costCents: Math.max(0, Math.round(Number(line.costCents ?? line.unitCents) || 0)),
      barcode: String(line.barcode ?? "").replace(/\D/g, "").slice(0, 32),
    }))
    .filter((line) => line.label.length >= 2);
}

function fromProxyPayload(data: {
  html?: string;
  supplierName?: string;
  cnpj?: string;
  document?: string;
  day?: string;
  lines?: { label?: string; qty?: number; costCents?: number; unitCents?: number; barcode?: string }[];
}): RawInvoice | null {
  const lines = normalizeLines(data.lines);
  if (lines.length > 0) {
    return {
      supplierName: String(data.supplierName ?? "").trim(),
      cnpj: String(data.cnpj ?? "").replace(/\D/g, ""),
      document: String(data.document ?? "").trim(),
      day: String(data.day ?? "").trim(),
      lines,
    };
  }
  if (typeof data.html === "string" && data.html.length > 100) {
    const parsed = rawFromCouponText(data.html) ?? parseCouponPage(data.html);
    if (parsed && parsed.lines.length > 0) return parsed;
  }
  return null;
}

/**
 * Consulta NFC-e do consumidor (sem certificado).
 *
 * Oficial (ENCAT/CONFAZ Manual DANFE NFC-e QR Code): a URL do QR abre o portal
 * público da UF e devolve o DANFE completo com itens. Não há API JSON nacional
 * gratuita para isso. Webservices oficiais de XML (ex.: NFCeDownloadXML em SP)
 * exigem e-CNPJ do emitente — não serve para nota de compra de terceiro.
 *
 * Datacenter (Hetzner/AWS) costuma levar "Request Rejected" da WAF (SP bloqueia IP).
 * Browser no celular também não lê o HTML (CORS + X-Frame-Options).
 *
 * Ordem: NFCE_LOOKUP_URL (proxy BR ou API comercial) → fetch direto do app.
 */
export async function lookupCoupon(raw: string): Promise<LookupResult> {
  const target = couponUrl(raw);
  if (!target) return { invoice: null, proxyFailed: false };

  const proxy = process.env.NFCE_LOOKUP_URL?.trim();
  if (proxy) {
    try {
      const headers: Record<string, string> = {
        Accept: "application/json, text/html",
        "Content-Type": "application/json",
      };
      const token = process.env.NFCE_LOOKUP_TOKEN?.trim();
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(proxy, {
        method: "POST",
        headers,
        body: JSON.stringify({ qr: target }),
        signal: AbortSignal.timeout(90_000),
        cache: "no-store",
      });
      const body = await response.text();
      if (!response.ok) {
        console.error("[nfce-lookup] proxy http", response.status, body.slice(0, 200));
        return { invoice: null, proxyFailed: true };
      }
      const ctype = response.headers.get("content-type") ?? "";
      if (ctype.includes("json") || body.trimStart().startsWith("{")) {
        try {
          const data = JSON.parse(body) as Parameters<typeof fromProxyPayload>[0];
          const invoice = fromProxyPayload(data);
          if (invoice) return { invoice, proxyFailed: false };
          console.error("[nfce-lookup] proxy json sem itens", body.slice(0, 200));
          return { invoice: null, proxyFailed: true };
        } catch (error) {
          console.error("[nfce-lookup] proxy json inválido", error);
          return { invoice: null, proxyFailed: true };
        }
      }
      const parsed = rawFromCouponText(body) ?? parseCouponPage(body);
      if (parsed && parsed.lines.length > 0) return { invoice: parsed, proxyFailed: false };
      console.error("[nfce-lookup] proxy html sem itens", body.slice(0, 200));
      return { invoice: null, proxyFailed: true };
    } catch (error) {
      console.error("[nfce-lookup] proxy falhou", error);
      return { invoice: null, proxyFailed: true };
    }
  }

  try {
    return { invoice: await fetchCoupon(target), proxyFailed: false };
  } catch (error) {
    console.error("[nfce-lookup] fetch direto falhou", error);
    return { invoice: null, proxyFailed: false };
  }
}
