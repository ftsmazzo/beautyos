# BeautyOS — alinhamento operacional

> Revisão ECC (PM / Architect / Developer / QA) · 2026-10-28  
> Canvas: `BeautyOS-ops-alinhamento.canvas.tsx` no workspace Cursor.

## Veredito

Arquitetura do dia a dia coerente (uma conta, movimento de estoque, comissão na linha, caixa ≠ banco). Painel operacional fechado para o próximo ciclo (agente WhatsApp). NFC-e via Tailscale Funnel + Playwright no PC; OCR fora de propósito.

**Não reabrir agora:** cupom de desconto, clubes, promoções, pesquisa, Open Finance, Next 16, cérebro Donna sem pedido, meta mensal de extras, fidelidade/pontos/foto de catálogo.

## 1. Mapa delivered / parcial / missing

| Domínio | Status | O que há | Gap | Papel |
|---------|--------|----------|-----|-------|
| Agenda → horário → comanda | Entregue | Grade, encaixe, bloqueio, comanda do dia | Prova E2E do dia completo | Balcão / profissional |
| Comanda → pagamento split → fechar | Entregue | Várias formas, conta do cliente, pacote na linha | Auditoria UX de troca cliente/valor | Balcão |
| Caixa do balcão | Entregue | Movimentos do dia, separado da tesouraria | Smoke no SHA deployado | Balcão |
| Comissão na linha + taxa cartão | Entregue | Extrato, `card_fee_share`, pacote no preço interno | Compartilhar comissão (secretária) fora | Admin / profissional |
| Estoque / compra / NFC-e / celular | Entregue | XML/PDF, QR→proxy Funnel→itens, bridge celular, criar produto, barcode, lista mínimo | XML se PC/Funnel cair | Balcão |
| Movimentos + compras + margem | Entregue | Painel movimentos, relatório compras, estoque custo/margem | Aceite operacional formal | Balcão / admin |
| Alertas / ação | Parcial | Fila estoque→montar compra; receber abre `/financeiro/receber` no balcão; pagar atrasado admin | Smoke S7 logado | Misto |
| Financeiro (pagar/receber/bancos/fluxo) | Entregue | Tesouraria admin; balcão só A receber | Contas a pagar / bancos só admin | Admin / balcão |
| Pacotes vendidos / perdão / relatório | Entregue | Filtros, idas, perdão, cobrar diferença | Smoke venda+uso no mesmo dia | Balcão |
| Relatórios gerenciais | Entregue | Hub + detalhe (agenda, comandas, clientes, extras, financeiro, estoque) | Meta mensal de extras (adiado) | Admin / balcão |
| Agente / Donna | Parcial — **próximo ciclo** | Módulo, webhook, tools; LLM opcional | Ligar Evolution + `OPENAI_*` + cérebro | Admin |
| PWA / cliente | Parcial | Manifest + shell | Catálogo cliente, créditos no app | Cliente |
| Fidelidade / pontos / foto catálogo | Faltando | — | Doc pede quando superfície cliente existir | — |
| Cupom desconto / clube / promo / pesquisa | Fora | — | Segundo sprint de propósito | — |
| Open Finance / Next 16 | Fora | — | Excluídos pelo produto | — |
| Docs / processo (issue→PR) | Parcial | docs/01–06 | Plano 06 desatualizado; ship direto em `main` | Time |

## 2. Walkthrough P0 — um dia no balcão

Critério: operador fecha o ciclo sem gambiarra. Rodar no SHA EasyPanel (`Ctrl+F5`).

| # | Passo | Prova de aceite | Severidade |
|---|-------|-----------------|------------|
| 1 | Abrir agenda do dia e marcar 1 horário | Horário na grade + linha na comanda do cliente | P0 |
| 2 | Vender produto + serviço na mesma comanda | Estoque cai; comissão nasce na linha | P0 |
| 3 | Usar 1 crédito de pacote (se houver) | Preço interno na comissão; estoque do produto do pacote se houver | P0 |
| 4 | Fechar com split (pix + cartão) | Caixa do dia bate; taxa abate só a parte da casa | P0 |
| 5 | Conta do cliente (parcial) | A receber sobe; crédito/débito coerente na ficha | P0 |
| 6 | Ler cupom NFC-e no celular → conferir → lançar | Itens/qtd/custo; estoque sobe; custo atualiza | P0 |
| 7 | Montar compra do mínimo (2 fornecedores) | Chips separam; `LISTA`+data; sem misturar fornecedor | P1 |
| 8 | Alertas: estoque / receber / pagar | Link certo por papel (balcão vs admin) | P0 |
| 9 | Extrato de comissão do profissional | Mesma conta do ranking/início | P1 |
| 10 | Payable da nota + quitar | Tesouraria; caixa balcão intacto | P1 |

## 3. Smoke E2E mínimo (logado)

CI (`tsc` / lint / build) **não** substitui isto. Só depois de `inspectAppService.commit.sha` = `HEAD`.

| ID | Fluxo | Dado | Pass | Fail | Sev |
|----|-------|------|------|------|-----|
| S1 | NFC-e QR completo → SEFAZ → draft | QR impresso com `p=chave\|…\|hash` | ≥1 linha com qtd e custo; CNPJ/número | Consulta vazia / parser sem item | P0 |
| S2 | QR só chave (sem hash) | URL ou 44 dígitos sem CSC | Erro claro; sem inventar itens | Draft falso ou silêncio | P0 |
| S3 | Bridge celular → balcão | Ler no celular → foto com QR | Foto + draft no painel em ≤10 min do token | Câmera no desktop / foto não chega | P0 |
| S4 | Criar produto + barcode na compra | Linha `__new__` com código da nota | Produto insumo; 2ª compra casa pelo código | Duplicata ou código perdido | P0 |
| S5 | Nota duplicada | Mesmo fornecedor + documento | Erro `nota` | Segundo lançamento no estoque | P0 |
| S6 | Restock multi-fornecedor | ≥2 fornecedores no mínimo | Chips; lista só de um grupo | Mistura fornecedores | P1 |
| S7 | Alertas por papel | Login balcão e admin | Balcão sem 403 na ação que usa; admin vê pagar atrasado | Balcão cai em `/financeiro` e some | P0 |
| S8 | Fechar comanda split + estoque | 1 serviço + 1 produto | Caixa + movimento venda + comissão | Estoque parado ou caixa ≠ pagamentos | P0 |
| S9 | Foto cupom sem QR / OCR | Imagem sem código | Mensagem cupom; sem fingir leitura | Itens inventados | P1 |
| S10 | Deploy SHA | HEAD = commit do serviço | Smoke no build certo | Testar build antigo | P0 |

## Ordem sugerida

1. Rodar walkthrough P0 + smokes S1–S8 e S10 no ambiente deployado.  
2. Atualizar `docs/06-PLANO-IMPLEMENTACAO.md` (status real das fases).  
3. Só então escolher próximo domínio: **A)** fechar contrato alertas/papel + estoque↔caixa, ou **B)** dívida do cliente + auditoria de edição.

## Execução (2026-10-28 → 2026-10-29)

| Item | Status |
|------|--------|
| Atualizar `docs/06` | Feito |
| Contrato alertas → a receber no balcão | Feito (`requireOperator` + menu A receber) |
| Contas a pagar só admin | Mantido |
| Smoke S1/S2 automatizado | Feito (`npm run smoke:cupom`; S1-live SKIP WAF; **S1-proxy PASS**) |
| Deploy SHA = HEAD | Feito (ver EasyPanel `beautyos/app`) |
| Smoke S3–S8 / walkthrough logado | Feito o suficiente para fechar painel (cupom celular validado 29/10) |
| Domínio A: alertas/papel + atalhos A receber | Feito + prova E2E admin e balcão |
| Domínio B: log de reabertura | Feito + prova E2E (histórico + Logs) |
| Próximo corte | **Agente WhatsApp** (Evolution + LLM) |

### Prova admin (2026-10-28)

| ID | Resultado |
|----|-----------|
| P0.1 Agenda→comanda | PASS Corte Caioba 09:00 → comanda aberta |
| P0.2 Produto+serviço | PASS Pomada smoke R$25; estoque 10→9 |
| P0.4 Split pix+crédito | PASS R$40 + R$30; caixa R$70 |
| P0.5 Parcial | PASS “Falta R$30” após só o pix |
| Fechar/reabrir + log | PASS Histórico “Reabertura”; Logs filtro |
| S7 admin alertas | PASS “Falta receber” → `/financeiro/receber` |
| S3 bridge celular | PASS (29/10) — QR no celular → draft com itens via Funnel |
| P0.6 NFC-e live | PASS (29/10) — proxy Playwright + Funnel; itens no balcão |

### Prova balcão (2026-10-28)

Criado usuário `balcao.smoke@beautyos.test` (papel Balcão) — casa só tinha admin.

| ID | Resultado |
|----|-----------|
| S7 menu | PASS Financeiro só “A receber” (sem A pagar/bancos/fluxo) |
| S7 `/financeiro/receber` | PASS lista 4 · R$320 |
| S7 `/financeiro` (pagar) | PASS redireciona para `/inicio` |
| S7 alertas | PASS só “Falta receber” → receber; sem contas atrasadas |
| P0.3 visita pacote | PASS Barba 29/10 → Realizado abate crédito (5/6); linha R$0 na comanda |
| Correção | `236c606` — visita futura sem linha passava Realizado sem abater |
