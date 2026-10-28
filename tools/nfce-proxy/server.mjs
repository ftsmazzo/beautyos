/**
 * Proxy NFC-e no PC (IP residencial). Usa Chromium — fetch Node é bloqueado pela WAF da SEFAZ.
 *
 *   $env:HOST="10.66.66.1"; $env:PORT="8787"; $env:TOKEN="segredo"; node server.mjs
 *
 * POST /lookup  { "qr": "https://...gov.br/..." }  → HTML do portal
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

async function pull(qr) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      locale: "pt-BR",
    });
    const response = await page.goto(qr, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(800);
    const html = await page.content();
    const status = response?.status() ?? 0;
    if (status && status >= 400) throw new Error(`http_${status}`);
    if (/request rejected|access denied/i.test(html.slice(0, 2_000))) throw new Error("sefaz_blocked");
    if (html.length < 400) throw new Error("empty");
    return html;
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
      res.writeHead(401);
      res.end();
      return;
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  let qr = "";
  try {
    qr = String(JSON.parse(Buffer.concat(chunks).toString("utf8")).qr || "").trim();
  } catch {
    res.writeHead(400);
    res.end("bad_json");
    return;
  }
  if (!allow(qr)) {
    res.writeHead(400);
    res.end("bad_qr");
    return;
  }
  try {
    const html = await pull(qr);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "fail" }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`nfce-proxy (playwright) em http://${HOST}:${PORT}/lookup`);
});
