# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Operador no balcão (secretária/recepção), profissional na cadeira, administrador/dono. Cliente final entra depois via WhatsApp (agente) e PWA — fora deste redesign de identidade do painel.

Cena principal: o mesmo sistema serve o ritmo do balcão (agenda → comanda → caixa → estoque) e a leitura do dono (financeiro, relatórios). O balcão manda na densidade e na frequência de clique.

## Product Purpose

BeautyOS é o sistema operacional de uma barbearia ou de um salão — uma conta por negócio — para abrir o dia, atender, cobrar, comprar estoque e fechar caixa sem misturar casas nem parecer planilha genérica.

Sucesso: a casa opera o dia inteiro no painel sem gambiarra; o visual transmite o calibre do negócio que o produto serve.

## Positioning

Não é marketplace de agendamento (Fresha) nem clone de AppBarber. É o OS do balcão brasileiro (barbearia e salão), com densidade de informação, NFC-e/compra, caixa ≠ tesouraria, e agente WhatsApp no mesmo produto.

## Operating Context

Telas quentes: agenda, comanda, caixa, compra/NFC-e, a receber, alertas. Uso em desktop no balcão, luz mista, muitas ações por hora. Português. Papéis com menus distintos (balcão não vê contas a pagar).

## Capabilities and Constraints

- Funções do painel já entregues permanecem (agenda, comanda, split, pacotes, estoque/NFC-e Funnel, financeiro por papel, alertas, relatórios).
- Stack: Next.js App Router, TypeScript, Postgres, EasyPanel.
- Cupom de desconto, clubes, promo, Open Finance, Next 16 fora até pedido.
- Dois templates de identidade visual no mesmo produto: **Template A — salão editorial** (quiet luxury / matéria impressa) e **Template B — barbeiro oficina** (ferro, madeira, precisão). Cada conta escolhe o template; a estrutura de UI e os fluxos são compartilhados.
- Undecided: se o switch de template é por conta no admin ou flag de deploy — aberto no redesign.

## Brand Commitments

- Nome do produto: **BeautyOS** (intocável).
- Marcas das casas (Ragnarok, Donna) e tom de voz legado **não** são compromisso de marca neste redesign.
- Anti-referência: o visual atual (teal + gold + sidebar escura + canvas cinza + glow) não deve ser polido — deve ser substituído.
- Sem identidade genérica de SaaS/IA (roxo-indigo, cream+terracotta default, neon glow, pills em tudo).

## Evidence on Hand

- Docs de produto: `docs/01`–`06`, `docs/ops-alinhamento.md`.
- UI incumbente: `app/globals.css`, componentes em `src/ui`, rotas em `app/`.
- Referências de setor consultadas (pesquisa, não assets): RITORNI (editorial salão), AesthetiClinic (clínica-editorial), Fresha 2024 (spotlight seletivo). Não fabricar logos, prints ou depoimentos dessas marcas no produto.

## Product Principles

1. Densidade do balcão primeiro — informação útil no primeiro viewport, poucos cliques.
2. Um sistema, duas artes — salão e barbeiro compartilham componentes; a direção tipográfica/material muda.
3. Premium por precisão, não por ornamento — hairlines, tipografia e hierarquia > gradientes e glow.
4. Feedback imediato em toda ação quente (toast, progresso, estados).
5. Português operacional, sem emoji como linguagem de UI.

## Accessibility & Inclusion

Operação em desktop no balcão; `prefers-reduced-motion` obrigatório. Contraste legível sob luz de salão. Sem requisito WCAG formal declarado além disso.
