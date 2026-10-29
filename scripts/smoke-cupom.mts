/**
 * Smoke S1/S2 — NFC-e consult + chave sem hash (sem login).
 * Uso: npm run smoke:cupom
 *
 * S1-live (fetch Node direto na SEFAZ) pode SKIP por WAF — isso é esperado.
 * S1-proxy valida o caminho de produção (Funnel/Playwright) quando NFCE_LOOKUP_* estiver setado.
 */
import { couponUrl, fetchCoupon, parseCouponPage } from "../src/catalog/invoice.ts";

const QR =
  "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=35240845543915098211650170000016801096369037|2|1|4|8994FCD60797644364394702B897B1839F040D3F";
const KEY_ONLY =
  "https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=35240845543915098211650170000016801096369037";

let failed = 0;

function ok(id: string, pass: boolean, detail: string) {
  console.log(`${pass ? "PASS" : "FAIL"} ${id} ${detail}`);
  if (!pass) failed += 1;
}

const local = parseCouponPage(`
HIPER
CNPJ: 45.543.915/0982-11
AMC ROUP CONCE DOWNY (Código: 3397270 ) Qtde.: 1 UN: un Vl. Unit.: 54,99
BOLINHO CHOCOLATE CB (Código: 6729703 ) Qtde.: 2 UN: un Vl. Unit.: 1,99
Número: 1680 Emissão: 08/08/2024
`);
ok(
  "S1-local",
  Boolean(local && local.lines.length === 2 && local.lines[0].barcode === "3397270" && local.lines[1].qty === 2),
  local ? `${local.lines.length} linhas barcode=${local.lines[0]?.barcode}` : "null",
);

ok("S1-allow", couponUrl(QR).includes("nfce.fazenda.sp.gov.br"), "allowlist QR");
ok("S1-block", couponUrl("https://example.com/nfce") === "", "bloqueia host estranho");

try {
  const live = await fetchCoupon(QR);
  if (live && live.lines.length >= 1 && live.document && live.cnpj) {
    ok("S1-live", true, `doc=${live.document} n=${live.lines.length} first=${live.lines[0]?.label}`);
  } else {
    // Node fetch direto costuma ser WAF no datacenter/casa — caminho oficial é o proxy.
    console.log("SKIP S1-live fetch direto sem itens (WAF esperado; use S1-proxy)");
  }
} catch (error) {
  console.log(`SKIP S1-live rede/WAF SEFAZ: ${error instanceof Error ? error.message : error}`);
}

const proxy = process.env.NFCE_LOOKUP_URL?.trim() || "https://desktop-flgv1fq.taile1a3fa.ts.net/lookup";
const token = process.env.NFCE_LOOKUP_TOKEN?.trim() || "beleza-nfce-2026";
try {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(proxy, {
    method: "POST",
    headers,
    body: JSON.stringify({ qr: QR }),
    signal: AbortSignal.timeout(90_000),
  });
  const body = await response.text();
  if (!response.ok) {
    ok("S1-proxy", false, `http ${response.status} ${body.slice(0, 120)}`);
  } else {
    const data = JSON.parse(body) as { lines?: { label?: string; qty?: number; costCents?: number }[]; document?: string; cnpj?: string };
    const n = data.lines?.length ?? 0;
    ok(
      "S1-proxy",
      n >= 1 && Boolean(data.document || data.cnpj),
      `doc=${data.document ?? "?"} n=${n} first=${data.lines?.[0]?.label ?? "?"}`,
    );
  }
} catch (error) {
  ok("S1-proxy", false, error instanceof Error ? error.message : String(error));
}

try {
  const bare = await fetchCoupon(KEY_ONLY);
  ok(
    "S2-key",
    !bare || bare.lines.length === 0,
    bare ? `linhas=${bare.lines.length} (esperado 0)` : "null/sem itens",
  );
} catch (error) {
  console.log(`SKIP S2-key rede SEFAZ: ${error instanceof Error ? error.message : error}`);
}

ok("S2-url", couponUrl("not-a-url") === "", "URL inválida");

if (failed) {
  console.error(`\n${failed} falha(s)`);
  process.exit(1);
}
console.log("\nSmokes S1/S2 ok");
