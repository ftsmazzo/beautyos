import { centsToInput, digits } from "@/catalog/format";

export type InvoiceLine = { label: string; qty: number; cost: string; productId: string };
export type InvoiceDraft = {
  supplierId: string;
  supplierName: string;
  cnpj: string;
  document: string;
  day: string;
  lines: InvoiceLine[];
};

type RawLine = { label: string; qty: number; costCents: number };
type RawInvoice = { supplierName: string; cnpj: string; document: string; day: string; lines: RawLine[] };

function fold(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function unescapeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}>([^<]*)</${name}>`, "i"));
  return unescapeXml(match?.[1]?.trim() ?? "");
}

function asDay(value: string) {
  const iso = value.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

function xmlAmount(value: string) {
  const amount = Number(value.trim());
  return Number.isFinite(amount) ? amount : 0;
}

function xmlQty(value: string) {
  const amount = xmlAmount(value);
  if (amount <= 0) return 1;
  return Math.max(1, Math.round(amount));
}

function xmlCents(value: string) {
  return Math.max(0, Math.round(xmlAmount(value) * 100));
}

function brAmount(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.includes(",") ? trimmed.replace(/\./g, "").replace(",", ".") : trimmed;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function brQty(value: string) {
  const amount = brAmount(value);
  if (amount <= 0) return 1;
  return Math.max(1, Math.round(amount));
}

function brCents(value: string) {
  return Math.max(0, Math.round(brAmount(value) * 100));
}

function plainXml(xml: string) {
  return xml.replace(/<\/?[\w-]+:/g, (token) => (token.startsWith("</") ? "</" : "<"));
}

export function parseNfeXml(xml: string): RawInvoice | null {
  const plain = plainXml(xml);
  if (!/<infNFe[\s>]|<emit[\s>]/i.test(plain)) return null;
  const emit = plain.match(/<emit[\s>][\s\S]*?<\/emit>/i)?.[0] ?? "";
  const ide = plain.match(/<ide[\s>][\s\S]*?<\/ide>/i)?.[0] ?? "";
  const lines: RawLine[] = [];
  for (const match of plain.matchAll(/<det[\s>][\s\S]*?<\/det>/gi)) {
    const prod = match[0].match(/<prod[\s>][\s\S]*?<\/prod>/i)?.[0] ?? match[0];
    const label = tag(prod, "xProd");
    if (label.length < 2) continue;
    const qty = xmlQty(tag(prod, "qCom") || "1");
    const unit = tag(prod, "vUnCom");
    const total = tag(prod, "vProd");
    const costCents = unit ? xmlCents(unit) : Math.round(xmlCents(total) / qty);
    lines.push({ label, qty, costCents });
    if (lines.length >= 40) break;
  }
  return {
    supplierName: tag(emit, "xNome") || tag(emit, "xFant"),
    cnpj: digits(tag(emit, "CNPJ") || tag(emit, "CPF")),
    document: tag(ide, "nNF"),
    day: asDay(tag(ide, "dhEmi") || tag(ide, "dEmi")),
    lines,
  };
}

function moneyHits(row: string) {
  return [...row.matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)];
}

function lineFromRow(row: string): RawLine | null {
  const hits = moneyHits(row);
  if (hits.length >= 2) {
    const unit = hits[hits.length - 2];
    const before = row.slice(0, unit.index ?? 0).trim();
    const qtyMatch = before.match(/(\d{1,4}(?:[.,]\d{1,4})?)\s*$/);
    if (qtyMatch?.index == null) return null;
    const label = before
      .slice(0, qtyMatch.index)
      .replace(/\s+\d{4,8}\s+\d{2,3}\s+\d{4}\s+[A-Za-z]{1,4}\s*$/i, "")
      .replace(/^\d{1,14}\s+/, "")
      .trim();
    if (label.length < 3 || /^(total|icms|frete|desconto|valor|descri|produto|codigo|dados)/i.test(label)) return null;
    return { label: label.slice(0, 120), qty: brQty(qtyMatch[1]), costCents: brCents(unit[0]) };
  }
  const money = row.match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2})\s*$/);
  if (!money || money.index == null) return null;
  const rest = row.slice(0, money.index).trim();
  const qtyMatch = rest.match(/^(.*?)(?:\s+)(\d{1,4}(?:[.,]\d{1,4})?)$/);
  const label = (qtyMatch ? qtyMatch[1] : rest).trim();
  if (label.length < 3 || /^(total|icms|frete|desconto|valor)/i.test(label)) return null;
  return { label: label.slice(0, 120), qty: qtyMatch ? brQty(qtyMatch[2]) : 1, costCents: brCents(money[1]) };
}

function parseLoose(text: string): RawInvoice | null {
  const cnpj = text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/)?.[0] ?? "";
  const numbered = text.match(/(?:NF-?e[^\d]{0,20}|N[º°o.]\s*)(\d{1,3}(?:\.\d{3})+|\d{1,12})/i)?.[1] ?? "";
  const received = text.match(/recebemos de\s+([^\n|]{3,80})/i)?.[1] ?? "";
  const razao = text.match(/raz[aã]o social\s*[:\-]?\s*([^\n]{3,80})/i)?.[1] ?? "";
  const supplierName = (received || razao).replace(/\s{2,}.*/, "").trim();
  const lines: RawLine[] = [];
  for (const row of text.split(/\r?\n/)) {
    const line = lineFromRow(row);
    if (!line) continue;
    lines.push(line);
    if (lines.length >= 40) break;
  }
  if (!cnpj && !numbered && lines.length === 0 && !supplierName) return null;
  return { supplierName, cnpj: digits(cnpj), document: numbered.replace(/\./g, ""), day: asDay(text), lines };
}

async function pdfText(bytes: Uint8Array) {
  const { extractTextItems, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const extracted = await extractTextItems(pdf);
  const lines: string[] = [];
  for (const page of extracted.items) {
    const groups: { y: number; cells: { x: number; str: string }[] }[] = [];
    for (const item of page) {
      const text = item.str.trim();
      if (!text) continue;
      const group = groups.find((row) => Math.abs(row.y - item.y) <= 2);
      if (group) group.cells.push({ x: item.x, str: text });
      else groups.push({ y: item.y, cells: [{ x: item.x, str: text }] });
    }
    groups.sort((left, right) => right.y - left.y);
    for (const group of groups) {
      group.cells.sort((left, right) => left.x - right.x);
      lines.push(group.cells.map((cell) => cell.str).join(" "));
    }
  }
  return lines.join("\n").slice(0, 12_000);
}

async function askModel(userContent: string | { mime: string; base64: string }) {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const instruction = "Extraia a nota de compra. Responda só JSON com supplierName, cnpj, document, day (YYYY-MM-DD) e lines [{label, qty, unitCents}]. Não invente item. qty inteiro. unitCents em centavos.";
  const content = typeof userContent === "string"
    ? userContent
    : [
        { type: "text", text: instruction },
        { type: "image_url", image_url: { url: `data:${userContent.mime};base64,${userContent.base64}` } },
      ];
  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: instruction },
          { role: "user", content },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: { message?: { content?: string | null } }[] };
    return jsonInvoice(data.choices?.[0]?.message?.content ?? "");
  } catch {
    return null;
  }
}

function jsonInvoice(raw: string): RawInvoice | null {
  try {
    const parsed = JSON.parse(raw) as {
      supplierName?: string;
      cnpj?: string;
      document?: string;
      day?: string;
      lines?: { label?: string; qty?: number; unitCents?: number }[];
    };
    const lines = (parsed.lines ?? [])
      .map((line) => ({
        label: String(line.label ?? "").trim().slice(0, 120),
        qty: Math.max(1, Math.round(Number(line.qty) || 1)),
        costCents: Math.max(0, Math.round(Number(line.unitCents) || 0)),
      }))
      .filter((line) => line.label.length >= 2)
      .slice(0, 40);
    return {
      supplierName: String(parsed.supplierName ?? "").trim(),
      cnpj: digits(String(parsed.cnpj ?? "")),
      document: String(parsed.document ?? "").trim(),
      day: asDay(String(parsed.day ?? "")),
      lines,
    };
  } catch {
    return null;
  }
}

function score(label: string, name: string) {
  const left = fold(label);
  const right = fold(name);
  if (!left || !right) return 0;
  if (left === right) return 3;
  if (left.length >= 4 && (right.includes(left) || left.includes(right))) return 2;
  return 0;
}

export async function readInvoiceFile(
  fileName: string,
  mime: string,
  bytes: Uint8Array,
): Promise<RawInvoice | null> {
  const head = new TextDecoder().decode(bytes.slice(0, 300)).trim().toLowerCase();
  const name = fileName.toLowerCase();
  if (name.endsWith(".xml") || head.startsWith("<?xml") || head.includes("<nfe") || head.includes("<nfce")) {
    return parseNfeXml(new TextDecoder().decode(bytes));
  }
  if (name.endsWith(".pdf") || head.startsWith("%pdf")) {
    let text = "";
    try {
      text = await pdfText(bytes);
    } catch {
      return null;
    }
    const loose = parseLoose(text);
    if (loose && loose.lines.length > 0) return loose;
    return (await askModel(text || "sem texto")) ?? loose;
  }
  if (mime.startsWith("image/") || /\.(jpe?g|png|webp)$/.test(name)) {
    if (bytes.byteLength > 4_000_000) return null;
    return askModel({ mime: mime || "image/jpeg", base64: Buffer.from(bytes).toString("base64") });
  }
  return null;
}

export function draftFromRaw(
  raw: RawInvoice,
  suppliers: { id: string; name: string; cnpj: string | null }[],
  products: { id: string; name: string }[],
  aliases: { supplierId: string; label: string; productId: string }[],
): InvoiceDraft {
  const cnpj = digits(raw.cnpj);
  const supplier = suppliers.find((item) => cnpj && digits(item.cnpj ?? "") === cnpj)
    ?? suppliers.find((item) => raw.supplierName && fold(item.name) === fold(raw.supplierName));
  const labels = aliases.filter((item) => !supplier || item.supplierId === supplier.id);
  const lines = raw.lines.map((line) => {
    const key = fold(line.label);
    const alias = labels.find((item) => fold(item.label) === key);
    let productId = alias?.productId ?? "";
    if (!productId) {
      let best = 0;
      for (const product of products) {
        const next = score(line.label, product.name);
        if (next > best) {
          best = next;
          productId = product.id;
        }
      }
    }
    return { label: line.label, qty: line.qty, cost: centsToInput(line.costCents), productId };
  });
  return {
    supplierId: supplier?.id ?? "",
    supplierName: supplier?.name || raw.supplierName,
    cnpj,
    document: raw.document,
    day: raw.day,
    lines,
  };
}
