# Consulta NFC-e (cupom / QR)

## O que a documentação oficial diz

Fontes: [ENCAT — URL por UF](https://nfce.encat.org/desenvolvedor/qrcode/), Manual CONFAZ DANFE NFC-e QR Code, NT 2025.001 (QR v3).

1. O QR **não carrega os itens**. Carrega a **URL do portal público** da SEFAZ da UF + chave (e metadados/hash conforme v2/v3).
2. A consulta do **consumidor** é esse portal HTML: o resultado deve ser o DANFE completo **com itens**.
3. **Não há API JSON nacional gratuita** para essa consulta de consumidor.
4. Webservices oficiais (ex. SP `NFCeDownloadXML`) devolvem XML, mas exigem **e-CNPJ do emitente** — serve para a nota da própria empresa, não para compra de terceiro no balcão.
5. QR v3 (NT 2025.001, prod. 01/09/2025): online `?p=CHAVE|3|AMBIENTE`; v2 continua aceita.

## Por que o BeautyOS no EasyPanel falha

- O app roda em datacenter (Hetzner). A SEFAZ-SP responde `Request Rejected` (WAF/IP). Bloqueio de IP em cloud BR também já foi relatado (nfephp, mai/2024).
- No celular, `fetch(urlDoQr)` até pode sair do IP residencial, mas o browser **não entrega o HTML ao JS** (sem `Access-Control-Allow-Origin`) e o portal SP manda `X-Frame-Options: SAMEORIGIN` (sem iframe).

Conclusão: OCR de foto **não** é o caminho certo. O caminho certo é **consulta do portal/API a partir de IP que a SEFAZ aceite**, ou **XML** que o fornecedor já tem.

## O que o código faz

1. Celular lê só o **link .gov.br** e manda ao balcão.
2. Servidor chama `lookupCoupon`:
   - se existir `NFCE_LOOKUP_URL` → POST `{ "qr": "<url>" }` (header opcional `Authorization: Bearer` via `NFCE_LOOKUP_TOKEN`);
   - senão tenta `fetch` direto no portal (só funciona se o IP do app não estiver bloqueado).
3. Sem itens: preenche CNPJ/número pela chave (44 dígitos) e pede XML ou provedor.

## Como tornar a consulta efetiva

Escolher **uma**:

| Opção | Prós | Contras |
|-------|------|---------|
| **A. Proxy no Brasil** (`tools/nfce-proxy`) apontando `NFCE_LOOKUP_URL` | Controle, sem OCR | Precisa VPS/IP BR; WAF pode bloquear e exigir rotação |
| **B. API comercial** (Tera, Infosimples, etc.) no mesmo contrato JSON | Persistência, 27 UFs | Custo por consulta |
| **C. XML/PDF no balcão** | Já funciona hoje | Manual no fornecedor |
| **D. Hospedar o app em IP BR** | Pode bastar o fetch atual | SP ainda pode banir cloud |

Contrato do proxy/API:

```http
POST /lookup
Content-Type: application/json

{ "qr": "https://www.nfce.fazenda.sp.gov.br/qrcode?p=..." }
```

Resposta aceita:

- `application/json` com `lines[{ label, qty, costCents, barcode? }]` (+ opcional supplierName, cnpj, document, day), ou
- `application/json` com `html` (HTML do portal), ou
- `text/html` cru do portal.
