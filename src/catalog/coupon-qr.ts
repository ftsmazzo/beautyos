/** Helpers puros do QR de NFC-e — safe no client e no server. */

export function couponUrl(raw: string) {
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "";
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) return "";
  const host = url.hostname.toLowerCase();
  if (!host.endsWith(".gov.br")) return "";
  if (!/(nfce|nfe|sefaz|fazenda|svrs)/.test(host)) return "";
  if (url.protocol === "http:") {
    url.protocol = "https:";
  }
  return url.toString();
}

export function couponKey(raw: string) {
  const url = couponUrl(raw);
  if (url) {
    try {
      const p = new URL(url).searchParams.get("p") ?? "";
      const key = p.split("|")[0]?.replace(/\D/g, "") ?? "";
      if (key.length === 44) return key;
    } catch {
      /* ignore */
    }
  }
  const digits = raw.replace(/\D/g, "");
  return digits.length === 44 ? digits : "";
}

/** Cabeçalho da NFC-e embutido na chave (sem itens). */
export function invoiceFromCouponKey(key: string) {
  if (key.length !== 44) return null;
  const aamm = key.slice(2, 6);
  const year = Number(aamm.slice(0, 2));
  const month = Number(aamm.slice(2, 4));
  if (year < 0 || month < 1 || month > 12) return null;
  return {
    supplierName: "",
    cnpj: key.slice(6, 20),
    document: String(Number(key.slice(25, 34)) || ""),
    day: `20${aamm.slice(0, 2)}-${aamm.slice(2, 4)}-01`,
    lines: [] as { label: string; qty: number; costCents: number; barcode: string }[],
  };
}

export function couponHost(raw: string) {
  const url = couponUrl(raw);
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
