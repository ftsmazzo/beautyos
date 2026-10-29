# BeautyOS

Fonte única das regras deste repositório. O app-barbearia é outro produto e permanece congelado.

## Produto

- Uma conta é um negócio. Sem seletor de unidade.
- A base está descrita em `docs/01` a `docs/06`.
- Cupom de desconto, clubes, promoções e pesquisa ficam fora até pedido. Painel de movimentos e relatórios de estoque/compras já entraram; ver `docs/ops-alinhamento.md`.
- Painel operacional (agenda→comanda→caixa, estoque/NFC-e, financeiro, pacotes) fechado. Próximo ciclo: agente WhatsApp (`docs/06` fase 6).
- Folga remunerada não entra até ser pedida.
- Smoke NFC-e: `npm run smoke:cupom` (S1-proxy exige Funnel no PC).

## Código

- Next.js (App Router), TypeScript, Postgres isolado.
- Dinheiro em centavos.
- Não copiar segredo para o repositório. `.env` fica de fora.

## Entrega

- Issue no GitHub, branch, pull request.
- Antes de merge: `npx tsc --noEmit` e `npm run build`.
