# TRD — BeautyOS

> Technical Requirements Document — traduz o PRD em decisões técnicas.
> Fonte: [x] Entrevista com usuário  [ ] Leitura de código existente
> Depende de: [PRD](01-PRD.md)

**Data**: 2026-09-28
**Status**: fechado em 2026-09-28 (fase 2 confirmada; seguir para o Fluxo)

Observação registrada para a fase de UI/UX, sem desenhar tela nesta fase: botões e janelas com mais usabilidade e atalhos. Isso se constrói ao longo dos módulos, não como um pacote de telas antecipado.

## 1. Stack tecnológica

| Camada | Tecnologia | Motivo/restrição |
|---|---|---|
| Banco de dados | PostgreSQL no EasyPanel, instância só deste projeto | Decisão. Nunca o banco do app-barbearia. |
| Frontend | Next.js (App Router) + React + TypeScript | Sugestão. Painel da casa e PWA do cliente no mesmo app. O agente que mantém o código trabalha bem nesta stack. Trocar de linguagem não deixa a IA mais fluida e atrasa a primeira conta. |
| Backend | O mesmo app Next.js (Server Actions e Route Handlers) | Sugestão. Um processo para um mantenedor. O agente de WhatsApp é um módulo com fronteira, não outro framework. |
| Acesso a dados | Drizzle ORM + migrations SQL | Sugestão. Schema explícito, para não repetir relacionamento solto. |
| Auth | Sessão própria. E-mail para recuperar senha | Sugestão. Sem login social nesta fase. |
| Idioma do produto e do agente | Português | Decisão. |

Por que não outra stack: Elixir, Go ou um sidecar Python deixam o agente e o dono com dois mundos. A fluidez com IA vem do módulo de conversa (WhatsApp + painel), não de trocar o framework do balcão.

## 2. Integrações externas

| Integração | Finalidade | Observações |
|---|---|---|
| WhatsApp + agente de IA | Conversa do cliente e painel das conversas na casa | Decisão: já entra no produto. Provedor da API do WhatsApp fica a definir no módulo do agente. |
| E-mail transacional | Notificação e resgate de senha | Decisão de escopo. Provedor a definir. Sugestão: SMTP ou Resend, o que o EasyPanel já permitir sem serviço pago extra. |
| Pagamento | Só lançamento financeiro (o que entrou, em qual forma) | Decisão: não operamos Pix, cartão nem maquininha. Sem gateway. |
| Nota fiscal, e-mail marketing e o restante | Fora deste momento | Decisão. |

## 3. Requisitos não-funcionais

- Performance: sugestão — ação de balcão responde em menos de um segundo na rede normal da casa. Sem número de SLA formal.
- Escalabilidade: uma conta primeiro. Validar. Só então escolher qual negócio é essa conta (Ragnarok ou Donna Unidade 2), incluir a outra e as que vierem. Volume inicial é uma unidade, não multidão de tenants.
- Segurança: sessão, senha com recuperação por e-mail, dados de uma conta invisíveis para outra. Pagamento registrado não é dado de cartão.
- Compliance: sugestão, não decisão — LGPD (cliente, agenda, conversa de WhatsApp). Política e termos ficam para quando a primeira conta estiver em uso.
- Disponibilidade: a da VPS do EasyPanel. Sem SLA contratado.
- Internacionalização: só português.

## 4. Ambiente e deploy

- Onde roda: EasyPanel. Serviços isolados deste projeto (app + Postgres próprios).
- Provedor: EasyPanel. Sem reutilizar serviço do app-barbearia.
- CI/CD: sugestão — repositório GitHub privado, checagem de TypeScript e lint antes de merge, deploy do app no EasyPanel a partir desse repositório.
- Ordem de contas: criar a primeira, validar, decidir qual unidade ela é, depois a próxima. Não abrir as duas em paralelo no primeiro ciclo.

## 5. Restrições herdadas

- Sistemas legados a integrar: nenhum. O app-barbearia não é fonte de dados nem de login. Serve só de lição do que não repetir.
- Decisões técnicas já tomadas e não-negociáveis: Postgres no EasyPanel; serviços isolados por projeto; produto e agente em português; pagamento é lançamento, não operação; e-mail só para notificação e senha; WhatsApp com agente e painel de conversas entra no produto.

## 6. Manutenção

- Quem mantém o código após o lançamento: o dono do produto. O agente implementa e revisa com ele. Não há time terceiro.
- Nível de complexidade aceitável: um app, um banco, módulos com fronteira. Sem microsserviço por função. Sem abstração antes de dois usos reais.

---

## Gaps & Recomendações (preencher só no Modo B — análise de repo existente)

Não se aplica. Projeto novo.
