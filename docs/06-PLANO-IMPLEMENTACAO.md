# Plano de Implementação — BeautyOS

> Roteiro da base que sobe primeiro.
> Depende de: [PRD](01-PRD.md), [TRD](02-TRD.md), [Fluxo](03-FLUXO-APP.md), [UI](04-UIUX.md), [Esquema](05-ESQUEMA-BACKEND.md)

**Data**: 2026-10-01
**Status**: base validada na auditoria de 2026-10-01. Código ainda não começou.

## 1. O que a base precisa ter para rodar

Uma conta, um negócio. Agenda, comanda e caixa do dia. Fichas de cliente, profissional, serviço, produto e pacote, com pacotes vendidos. Estoque que se move na venda, no uso, no consumo e na compra. Comissão nascida da linha. Financeiro de hoje replicado, separado do caixa do balcão. Agente de WhatsApp e PWA no mesmo produto, cada um no seu módulo. Lembretes, aniversário, lista de espera e taxas da maquininha permanecem, porque já são função da casa.

## 2. Fases

| Fase | Escopo | Prioridade | Dependências |
|---|---|---|---|
| 0 | Repositório novo, app que sobe, banco Postgres só deste projeto no EasyPanel | Alta | TRD |
| 1 | Conta, acesso e papéis (balcão, administrador, profissional, cliente) | Alta | Fase 0 |
| 2 | Fichas da base: serviço, profissional, cliente, produto, pacote | Alta | Fase 1 |
| 3 | Agenda, comanda, pagamento, caixa do dia, comissão | Alta | Fase 2 |
| 4 | Pacote vendido, idas, perdão, compra de estoque | Alta | Fase 3 |
| 5 | Financeiro replicado do módulo atual | Alta | Fase 1 |
| 6 | WhatsApp, lembretes, aniversário, espera, PWA | Alta | Fase 3 |
| 7 | Segundo sprint, depois do ar: cupom, clubes, promoções, pesquisa, painel de movimentações, relatórios de estoque | Depois | Base no ar |

## 3. Marcos

- Primeiro alvo: Ragnarok e Donna Unidade 2, cada uma na própria conta.
- O app-barbearia permanece congelado. Correção urgente nele não redesenha este.
- Folga remunerada não entra até ser pedida.

## 4. Critério de pronto da base

- Dá para abrir o dia na agenda, atender na comanda e fechar com mais de uma forma de pagamento.
- O tempo do horário é o da ficha do profissional naquele serviço.
- O pacote usa um serviço só, a soma dos preços internos fecha o preço, e a comissão do uso sai do preço interno.
- A compra entra no estoque e no custo. A mesma nota não entra duas vezes.
- O caixa do balcão não se mistura com o banco da tesouraria.
- Uma conta não enxerga a outra.
