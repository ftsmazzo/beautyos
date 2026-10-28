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
export async function lookupCoupon(raw: string): Promise<RawInvoice | null> {
  const target = couponUrl(raw);
  if (!target) return null;

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
        signal: AbortSignal.timeout(25_000),
      });
      if (response.ok) {
        const ctype = response.headers.get("content-type") ?? "";
        if (ctype.includes("application/json")) {
          const data = (await response.json()) as {
            html?: string;
            supplierName?: string;
            cnpj?: string;
            document?: string;
            day?: string;
            lines?: { label?: string; qty?: number; costCents?: number; unitCents?: number; barcode?: string }[];
          };
          if (typeof data.html === "string" && data.html.length > 100) {
            const parsed = rawFromCouponText(data.html) ?? parseCouponPage(data.html);
            if (parsed && parsed.lines.length > 0) return parsed;
          }
          const lines = (data.lines ?? [])
            .map((line) => ({
              label: String(line.label ?? "").trim().slice(0, 120),
              qty: Math.max(1, Math.round(Number(line.qty) || 1)),
              costCents: Math.max(0, Math.round(Number(line.costCents ?? line.unitCents) || 0)),
              barcode: String(line.barcode ?? "").replace(/\D/g, "").slice(0, 32),
            }))
            .filter((line) => line.label.length >= 2);
          if (lines.length > 0) {
            return {
              supplierName: String(data.supplierName ?? "").trim(),
              cnpj: String(data.cnpj ?? "").replace(/\D/g, ""),
              document: String(data.document ?? "").trim(),
              day: String(data.day ?? "").trim(),
              lines,
            };
          }
        } else {
          const html = await response.text();
          const parsed = rawFromCouponText(html) ?? parseCouponPage(html);
          if (parsed && parsed.lines.length > 0) return parsed;
        }
      }
    } catch {
      /* cai no fetch direto */
    }
  }

  try {
    return await fetchCoupon(target);
  } catch {
    return null;
  }
}
