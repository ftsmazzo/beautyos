# Plano de Implementação — BeautyOS

> Roteiro da base que sobe primeiro.
> Depende de: [PRD](01-PRD.md), [TRD](02-TRD.md), [Fluxo](03-FLUXO-APP.md), [UI](04-UIUX.md), [Esquema](05-ESQUEMA-BACKEND.md)
> Alinhamento operacional: [ops-alinhamento.md](ops-alinhamento.md)

**Data**: 2026-10-28  
**Status**: fases 0–6 no ar em produção. Fase 7 parcial (movimentos, estoque, compras). Aceite P0 / smoke E2E logado ainda em execução.

## 1. O que a base precisa ter para rodar

Uma conta, um negócio. Agenda, comanda e caixa do dia. Fichas de cliente, profissional, serviço, produto e pacote, com pacotes vendidos. Estoque que se move na venda, no uso, no consumo e na compra. Comissão nascida da linha. Financeiro de hoje replicado, separado do caixa do balcão. Agente de WhatsApp e PWA no mesmo produto, cada um no seu módulo. Lembretes, aniversário, lista de espera e taxas da maquininha permanecem, porque já são função da casa.

## 2. Fases

| Fase | Escopo | Status | Notas |
|---|---|---|---|
| 0 | Repositório, app, Postgres no EasyPanel | Feito | `main` + deploy beautyos/app |
| 1 | Conta, acesso e papéis | Feito | balcão, admin, profissional, cliente |
| 2 | Fichas: serviço, profissional, cliente, produto, pacote | Feito | |
| 3 | Agenda, comanda, pagamento, caixa, comissão | Feito | Taxa de cartão e parte da casa na comissão |
| 4 | Pacote vendido, idas, perdão, compra de estoque | Feito | NFC-e/celular, lista do mínimo |
| 5 | Financeiro (pagar, receber, bancos, cartões, fluxo) | Feito | Tesouraria admin; a receber também no balcão |
| 6 | WhatsApp/agente, lembretes, aniversário, espera, PWA | Parcial | Agente sem chave LLM em prod; PWA shell |
| 7 | Cupom desconto, clubes, promo, pesquisa; painel movimentos; relatórios estoque | Parcial | Movimentos + estoque/compras/margem feitos. Cupom/clube/promo/pesquisa fora de propósito |

## 3. Marcos

- Primeiro alvo: Ragnarok e Donna Unidade 2, cada uma na própria conta.
- O app-barbearia permanece congelado. Correção urgente nele não redesenha este.
- Folga remunerada não entra até ser pedida.
- Open Finance e Next 16 não entram neste ciclo.
- Aceite: walkthrough P0 + smokes S1–S10 em [ops-alinhamento.md](ops-alinhamento.md) no SHA deployado.

## 4. Critério de pronto da base

- Dá para abrir o dia na agenda, atender na comanda e fechar com mais de uma forma de pagamento.
- O tempo do horário é o da ficha do profissional naquele serviço.
- O pacote usa serviço do catálogo; a soma dos preços internos fecha o preço; a comissão do uso sai do preço interno.
- A compra entra no estoque e no custo. A mesma nota não entra duas vezes.
- O caixa do balcão não se mistura com o banco da tesouraria.
- Uma conta não enxerga a outra.
