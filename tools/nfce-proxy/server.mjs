/**
 * Proxy mínimo de consulta NFC-e para rodar em IP brasileiro.
 * Uso: NFCE_LOOKUP_URL=https://seu-host/lookup  TOKEN=... node server.mjs
 *
 * POST /lookup  { "qr": "https://...gov.br/..." }
 * → text/html do portal (o BeautyOS faz o parse) ou 502 se a SEFAZ rejeitar.
 */
import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const TOKEN = (process.env.TOKEN || "").trim();

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
  const response = await fetch(qr, {
    redirect: "follow",
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`http_${response.status}`);
  if (/request rejected|access denied|captcha/i.test(html.slice(0, 2_000))) {
    throw new Error("sefaz_blocked");
  }
  return html;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
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

server.listen(PORT, () => {
  console.log(`nfce-proxy :${PORT}`);
});
