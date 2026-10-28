/**
 * Proxy NFC-e no PC (Playwright). Sobe no login via atalho Startup.
 * Tailscale Funnel: https://desktop-flgv1fq.taile1a3fa.ts.net
 */
import http from "node:http";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT || 8787);
const HOST = (process.env.HOST || "127.0.0.1").trim();
const TOKEN = (process.env.TOKEN || process.env.NFCE_LOOKUP_TOKEN || "").trim();

function allow(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.toLowerCase();
    return host.endsWith(".gov.br") && /(nfce|nfe|sefaz|fazenda|svrs)/.test(host);
  } catch {
    return false;
  }
}

function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function brAmount(value) {
  const trimmed = String(value).trim();
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function extract(html) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h\d|td)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ");
  const cnpj = digits(text.match(/CNPJ:\s*([\d./-]{14,18})/i)?.[1] ?? "");
  const document = text.match(/N[úu]mero:\s*(\d+)/i)?.[1] ?? "";
  const emitted = text.match(/Emiss[ãa]o:\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? "";
  const day = emitted ? `${emitted.slice(6, 10)}-${emitted.slice(3, 5)}-${emitted.slice(0, 2)}` : "";
  const beforeCnpj = text.split(/CNPJ:/i)[0] ?? "";
  const supplierName =
    beforeCnpj
      .split("\n")
      .map((row) => row.trim())
      .filter((row) => row.length > 2 && !/documento auxiliar|nota fiscal|consulta/i.test(row))
      .pop() ?? "";
  const lines = [];
  const pattern =
    /([^\n()]{3,80}?)\s*\(C[óo]digo:\s*([^)]*?)\)\s*Qtde\.?:\s*([\d.,]+)[\s\S]{0,40}?Vl\.?\s*Unit\.?:\s*([\d.,]+)/gi;
  for (const match of text.matchAll(pattern)) {
    const label = match[1].replace(/\s+/g, " ").trim();
    if (label.length < 3 || /^(qtd|valor|forma|troco)/i.test(label)) continue;
    const barcode = digits(match[2]).slice(0, 32);
    lines.push({
      label: label.slice(0, 120),
      qty: Math.max(1, Math.round(brAmount(match[3]) || 1)),
      costCents: Math.max(0, Math.round(brAmount(match[4]) * 100)),
      barcode: barcode.length >= 3 ? barcode : "",
    });
    if (lines.length >= 80) break;
  }
  return { supplierName, cnpj, document, day, lines, html };
}

async function pull(qr) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "pt-BR",
    });
    const response = await page.goto(qr, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.waitForTimeout(1000);
    const html = await page.content();
    const status = response?.status() ?? 0;
    if (status && status >= 400) throw new Error(`http_${status}`);
    if (/request rejected|access denied/i.test(html.slice(0, 2_000))) throw new Error("sefaz_blocked");
    if (html.length < 400) throw new Error("empty");
    return extract(html);
  } finally {
    await browser.close();
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "nfce-proxy", engine: "playwright" }));
    return;
  }
  if (req.method !== "POST" || req.url !== "/lookup") {
    res.writeHead(404);
    res.end();
    return;
  }
  if (TOKEN) {
    const auth = req.headers.authorization || "";
    if (auth !== `Bearer ${TOKEN}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let qr = "";
  try {
    qr = String(JSON.parse(Buffer.concat(chunks).toString("utf8")).qr || "").trim();
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "bad_json" }));
    return;
  }
  if (!allow(qr)) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "bad_qr" }));
    return;
  }
  try {
    const data = await pull(qr);
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "fail" }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`nfce-proxy (playwright+json) em http://${HOST}:${PORT}/lookup`);
});
