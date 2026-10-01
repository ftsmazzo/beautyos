# PRD — BeautyOS

> Product Requirements Document — o quê e por quê, não como.
> Fonte: [x] Entrevista com usuário  [ ] Leitura de código existente

**Data**: 2026-09-28
**Responsável**: dono do produto
**Status**: fechado em 2026-09-28 (fase 1 confirmada; seguir para o TRD)

## 1. Resumo em uma frase

BeautyOS é o sistema de uma barbearia ou de um salão de beleza — balcão, cadeira, dono e cliente — com uma conta por negócio, módulos que entram ou saem conforme o plano, e entrega completa do produto.

## 2. Problema e contexto

- Problema real que motiva o projeto: o painel atual (Ragnarok/Donna, repositório app-barbearia) ficou preso à lógica do AppBarber. Telas nasceram sem função fechada, foram corrigidas no atropelo, menus ficaram bagunçados, funções duplicadas e o banco com relacionamentos errados. A “gestão de várias unidades” na mesma sessão virou confusão visual, com telas divididas entre unidades.
- Como é resolvido hoje: AppBarber no balcão, mais o painel atual, que permanece congelado (só correção urgente). BeautyOS não é refactor desse repositório.
- Por que agora: urgência operacional de Ragnarok e de Donna Unidade 2. Cada uma será a sua conta. Não há troca de unidade entre elas.

## 3. Público-alvo

- Persona(s) principal(is): três papéis no negócio, com permissões diferentes.
  - Secretária no balcão.
  - Profissional na cadeira.
  - Administrador (papel gerencial; não é um segundo balcão).
- Outros perfis de usuário relevantes: o cliente final entra no produto.
  - Pelo WhatsApp, via agente.
  - Por um PWA simples: o que já fez na barbearia ou no salão, créditos restantes do pacote, vencimento do pacote, e agendamentos (ver, editar, cancelar, agendar).

## 4. Objetivos e métricas de sucesso

| Objetivo | Métrica | Meta |
|---|---|---|
| Ragnarok operar no BeautyOS, sozinha na conta dela | Unidade usando o produto no dia a dia, sem tela de outra unidade | Sugestão, não decisão: primeira unidade em uso real |
| Donna Unidade 2 operar no BeautyOS, sozinha na conta dela | Idem, conta separada | Sugestão, não decisão: segunda conta isolada |
| Planos com módulos ligáveis | Um módulo pode ser incluído ou suprimido sem misturar dados de outro negócio | Decisão: diversidade de planos; entrega do produto é total |
| Cliente acompanha a própria relação com a casa | Agenda e pacote visíveis no WhatsApp (agente) e no PWA | Decisão de escopo; meta numérica a definir |

Métricas numéricas (tempo de atendimento, taxa de no-show, conversão de pacote) ficam a definir. Não foram pedidas nesta entrevista.

## 5. Escopo

### Dentro do escopo (produto completo, módulo a módulo)

- Entrega total. Não há corte de “MVP magro” negociável.
- Cada módulo é desenhado, implementado e validado na sua individualidade.
- Planos comerciais podem suprimir ou incluir módulos. O produto, como um todo, precisa existir.
- Papéis distintos: secretária, profissional, dono, cliente.
- Cliente: agente no WhatsApp e PWA simples (histórico, créditos, vencimento, agenda).
- O catálogo de módulos abaixo é o que o aplicativo atual já oferece. O BeautyOS preserva essas funções. O que muda é a rota, a regra e a interface. O menu atual não é copiado. Plano comercial pode desligar um módulo. Não pode apagar a função do produto.
- Hoje: agenda, lembretes, lista de espera.
- Cadastros: clientes, aniversariantes, profissionais, serviços, produtos, pacotes.
- Comanda: abertas, histórico, venda no celular.
- Equipe: comissões, ranking.
- Estoque: posição, lista de compra, entrada e saída.
- Financeiro: caixa e histórico, tesouraria, a pagar, a receber, bancos, cartões, fluxo de caixa, contas, relatórios.
- CRM e perfil do cliente.
- Inteligência: conversas, agente, disparos de WhatsApp.
- Configuração da empresa, taxas da maquininha, acessos.

### Fora do escopo (por enquanto)

- Única exclusão explícita: a mistura gerencial de várias unidades na mesma sessão — uma conta não troca de unidade nem divide tela com outra.
- O repositório app-barbearia não recebe essa reconstrução. Permanece onde está.

## 6. Funcionalidades principais

| Funcionalidade | Prioridade (MVP/depois) | Descrição curta |
|---|---|---|
| Conta por negócio | Produto | Uma barbearia ou um salão por conta. Sem seletor de unidade. |
| Papéis | Produto | Secretária, profissional, dono e cliente, com o que cada um pode ver e fazer. |
| Módulos por plano | Produto | Incluir ou suprimir módulo conforme o plano, sem encolher o desenho do produto. |
| Agenda | Produto | Agendar, editar, cancelar — balcão e cliente (PWA e agente). |
| Relação do cliente com a casa | Produto | O que já fez, créditos do pacote, vencimento. |
| Agente no WhatsApp | Produto | Interação do cliente com o agente. |
| PWA do cliente | Produto | Controle simples do que já é dele na casa. |
| Demais módulos de balcão | Produto | Tratados um a um (comanda, pagamento, caixa, comissão, pacote, estoque, relatório e o que o desenho seguinte nomear). Fronteira de cada um fecha no plano de módulos, não por corte de escopo. |

## 7. Restrições de negócio

- Prazo: urgência. Ragnarok e Donna Unidade 2 precisam do produto. Trabalho intenso, módulo a módulo, com validação — não atropelo de tela.
- Orçamento: a definir.
- Legais/regulatórias: sugestão, não decisão — LGPD (dados de cliente, agenda, WhatsApp). Detalhe no TRD.

## 8. Riscos e premissas

- Premissa: cada conta é um único negócio. Se Ragnarok ou Donna Unidade 2 precisarem operar várias unidades no mesmo login, este desenho quebra e volta ao problema que estamos tirando.
- Premissa: o painel atual fica congelado. BeautyOS é outro repositório. Correção urgente no antigo não redesenha o novo.
- Premissa: “entrega total” significa o produto completo com módulos ativáveis, não todas as telas do AppBarber copiadas.
- Risco: urgência das duas unidades empurrar código antes dos seis documentos e repetir menu duplicado e banco torto. Impacto alto. Mitigação: fechar fase antes de codar o módulo.
- Risco: agente de WhatsApp e PWA incharem o primeiro módulo de balcão. Mitigação: são módulos próprios, com fronteira, não aba dentro da comanda.

---

## Gaps & Recomendações (preencher só no Modo B — análise de repo existente)

Não se aplica. Projeto novo. O repositório atual entra só como lição do que não repetir.
