# BeautyOS

Fonte única das regras deste repositório. O app-barbearia é outro produto e permanece congelado.

## Produto

- Uma conta é um negócio. Sem seletor de unidade.
- A base está descrita em `docs/01` a `docs/06`.
- Cupom, clubes, promoções, pesquisa, painel de movimentações e relatórios de estoque esperam o segundo sprint, depois do programa no ar.
- Folga remunerada não entra até ser pedida.

## Código

- Next.js (App Router), TypeScript, Postgres isolado.
- Dinheiro em centavos.
- Não copiar segredo para o repositório. `.env` fica de fora.

## Entrega

- Issue no GitHub, branch, pull request.
- Antes de merge: `npx tsc --noEmit` e `npm run build`.
