# UI/UX Design — BeautyOS

> Direção visual e de experiência.
> Fonte: [x] Entrevista com usuário  [x] Lições do app-barbearia (o que preservar e o que não copiar)
> Depende de: [Fluxo do App](03-FLUXO-APP.md)

**Data**: 2026-09-28
**Status**: fechado em 2026-09-28. Seguir para o esquema do banco.

## 1. Referências e tom

- Referências visuais: a lógica e os atalhos do aplicativo atual. A tela do AppBarber não é referência visual. Laranja e verde eram a cara da Donna e da Ragnarok. O BeautyOS não se veste com essas cores. É um produto SaaS, com cara própria.
- Tom: fácil de operar, inteligível, quase divertido. O balcão não pode achar a tela desafiante. Denso na informação do horário e da comanda. Limpo no resto. Tipografia forte. Botão com função óbvia.
- A janela lateral de hoje não serve. Tipografia fraca e botão estranho saem.

## 2. Plataformas-alvo

- [x] Web no computador do balcão
- [x] PWA no celular, funcional e operativo: cliente, e quem opera a casa fora do computador
- [ ] App nativo: só se, na hora de construir o celular, ficar melhor que o PWA. Não é exigência agora
- [x] Desktop do balcão é a superfície principal

## 3. Sistema visual

- Casca do produto: cores frias e profissionais. Sugestão, não decisão de código: fundo claro, texto escuro, ação em azul-ardósia. Sem laranja e sem verde como cor da marca.
- Cores da grade continuam as já fechadas no fluxo (Agendado, Confirmado, Chegou, Em atendimento, Realizado, Bloqueado, Almoço, Fechado, Ausente, Cancelado, Encaixe, De fora). São significado do horário, não a marca. Cada quadro leva a palavra.
- Tipografia: forte e legível no balcão. Família a escolher na implementação. Requisito: nome, telefone, serviço e horário legíveis no quadro, sem apertar.
- Componentes centrais: grade da agenda, atalhos da agenda, comanda como superfície principal, menu de botão direito, ficha do profissional ligada à agenda.

## 4. Acessibilidade

- A cor não é o único sinal. O quadro escreve o estado.
- Contraste legível no balcão. Sem público específico além de quem opera o dia.
- Sugestão: mirar leitura confortável, não um selo formal de WCAG nesta fase.

## 5. Telas principais

| Tela | Jornada relacionada | Estado (rascunho/aprovado) |
|---|---|---|
| Agenda do dia | Balcão e profissional | Rascunho de direção |
| Comanda | Balcão, coração da operação | Rascunho de direção |
| Ficha do profissional | Tempo, preço e comissão que mudam a agenda | Rascunho de direção |
| PWA | Cliente e operação no celular | Rascunho de direção |

### Agenda

Além do calendário lateral, a agenda guarda os atalhos que já deixam o dia rápido: horários livres, lista de agendamentos, lista de espera, encaixe, bloqueio e botão direito. Abrir, fechar e reabrir a comanda também saem daí, no botão direito, sem caminho único.

O quadro mostra nome completo, telefone, serviço e horário, mais a palavra do estado. Encaixe e De fora continuam escritos quando a cor muda.

O tamanho do horário é o tempo daquele serviço na ficha daquele profissional.

### Comanda

É o coração. Dela se puxa, com poucos cliques, o que a situação pedir:

- dados do cliente, inclusive completar o sem nome e marcar de fora
- serviço, hora e profissional, todos alteráveis
- créditos restantes e prazo do pacote
- pagamento e crédito
- abrir, fechar e reabrir

Não é a gaveta lateral atual. É uma superfície legível, em que a ação está perto do dado.

### Ficha do profissional

Preço, tempo e comissão do serviço na pessoa. Mudou o tempo, a agenda passa a usar esse intervalo. As duas telas se revisam juntas.

## 6. O que não repetir

- Menu duplicado do aplicativo atual.
- Janela lateral fraca como lugar de operar a comanda.
- Marca laranja e verde da Donna e da Ragnarok.

---

## Gaps & Recomendações (preencher só no Modo B — análise de repo existente)

Não se aplica. Projeto novo. O aplicativo atual entra como lista do que a operação já sabe fazer, não como tela a copiar.
