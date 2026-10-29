# Consulta NFC-e (cupom / QR)

## O que a documentação oficial diz

Fontes: [ENCAT — URL por UF](https://nfce.encat.org/desenvolvedor/qrcode/), Manual CONFAZ DANFE NFC-e QR Code, NT 2025.001 (QR v3).

1. O QR **não carrega os itens**. Carrega a **URL do portal público** da SEFAZ da UF + chave (e metadados/hash conforme v2/v3).
2. A consulta do **consumidor** é esse portal HTML: o resultado deve ser o DANFE completo **com itens**.
3. **Não há API JSON nacional gratuita** para essa consulta de consumidor.
4. Webservices oficiais (ex. SP `NFCeDownloadXML`) devolvem XML, mas exigem **e-CNPJ do emitente** — serve para a nota da própria empresa, não para compra de terceiro no balcão.
5. QR v3 (NT 2025.001, prod. 01/09/2025): online `?p=CHAVE|3|AMBIENTE`; v2 continua aceita.

## Por que o BeautyOS no EasyPanel falha sozinho

- O app roda em datacenter (Hetzner). A SEFAZ-SP responde `Request Rejected` (WAF/IP).
- No celular, `fetch(urlDoQr)` até pode sair do IP residencial, mas o browser **não entrega o HTML ao JS** (CORS) e o portal SP manda `X-Frame-Options: SAMEORIGIN` (sem iframe).
- Node `fetch` no mesmo IP residencial também costuma levar WAF; **Chromium (Playwright)** passa.

Conclusão: OCR de foto **não** é o caminho. O caminho certo é **portal via browser real em IP que a SEFAZ aceite**, ou **XML**.

## Caminho em produção (Beleza)

1. Celular lê só o link `.gov.br` e manda ao balcão.
2. BeautyOS (Hetzner) POST em `NFCE_LOOKUP_URL` com Bearer `NFCE_LOOKUP_TOKEN`.
3. Proxy no PC (`tools/nfce-proxy`): Playwright abre o portal → devolve JSON `{ supplierName, cnpj, document, day, lines[{ label, qty, costCents, barcode }] }`.
4. Exposição pública fixa: **Tailscale Funnel** (sem porta no roteador, sem cloudflared).
5. Proxy sobe no login via atalho Startup `BeautyOS-NFCe-Proxy.lnk`.

Env no EasyPanel (já aplicado):

```
NFCE_LOOKUP_URL=https://desktop-flgv1fq.taile1a3fa.ts.net/lookup
NFCE_LOOKUP_TOKEN=<mesmo TOKEN do start-proxy.cmd>
```

Instalar / reinstalar no PC:

```powershell
powershell -ExecutionPolicy Bypass -File tools\nfce-proxy\install-windows.ps1
```

Exige: Tailscale logado, Funnel autorizado na conta, PC ligado no horário de compras.

## O que o código faz

1. `lookupCoupon` → proxy (timeout 90s) → se JSON com `lines`, usa direto; senão tenta HTML; senão fetch direto.
2. Sem itens mas com chave: preenche CNPJ/número e avisa (mensagem específica se o proxy falhou).
3. XML/PDF no balcão continua como fallback.

## Alternativas (se o Funnel não servir)

| Opção | Quando |
|-------|--------|
| **WireGuard casa→VPS** (`docs/ops/WIREGUARD-EXIT-CASA.md`) | Tem UDP 51820 no roteador e quer tráfego só no túnel |
| **API comercial** (Tera, Infosimples, …) | Várias UFs / sem PC ligado |
| **XML no balcão** | Sempre funciona; manual |
| **VPS BR** | Cloud BR às vezes também é bloqueado pela SEFAZ |

## Contrato do proxy

```http
POST /lookup
Authorization: Bearer <token>
Content-Type: application/json

{ "qr": "https://www.nfce.fazenda.sp.gov.br/...ConsultaQRCode...?p=..." }
```

Resposta `200` `application/json`:

```json
{
  "supplierName": "…",
  "cnpj": "…",
  "document": "…",
  "day": "YYYY-MM-DD",
  "lines": [{ "label": "…", "qty": 1, "costCents": 1990, "barcode": "…" }],
  "html": "<opcional>"
}
```

Também aceita JSON só com `html`, ou `text/html` cru.
