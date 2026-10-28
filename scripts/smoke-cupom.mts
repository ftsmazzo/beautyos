/**
 * Smoke S1/S2 — NFC-e consult + chave sem hash (sem login).
 * Uso: npx tsx scripts/smoke-cupom.mts
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
  ok(
    "S1-live",
    Boolean(live && live.lines.length >= 1 && live.document && live.cnpj),
    live ? `doc=${live.document} n=${live.lines.length} first=${live.lines[0]?.label}` : "null",
  );
} catch (error) {
  console.log(`SKIP S1-live rede SEFAZ: ${error instanceof Error ? error.message : error}`);
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
