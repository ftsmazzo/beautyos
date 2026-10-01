# Fluxo do App — BeautyOS

> Como o usuário se move pelo produto.
> Fonte: [x] Entrevista com usuário  [x] Lições do app-barbearia (problemas, não telas a copiar)
> Depende de: [PRD](01-PRD.md), [TRD](02-TRD.md)

**Data**: 2026-09-28
**Status**: rotas, comissão e UI fechadas em 2026-09-28. Esquema fechado em `05-ESQUEMA-BACKEND.md`. Auditoria da base em 2026-10-01.

## 1. Perfis de usuário

| Perfil | Descrição | Permissões principais |
|---|---|---|
| Balcão | Operação do dia inteiro da casa | Cadastro de clientes, serviços e profissionais. Agenda, encaixe, venda. Quando o módulo de IA existir: ajuste do agente. Não é o gerencial. |
| Administrador | Gestão da casa | Comissões, taxas de cartão, financeiro. Toggle funcional para ligar ou desligar funções das outras jornadas, porque cada empresa opera diferente no dia a dia. |
| Profissional | Só o que é dele | Agenda dele, consumos dele, comissões dele, com detalhe no clique. Pode agendar, editar, encaixar e cancelar os próprios horários, porque a carteira de clientes pode ser dele. O desenho fino do agendamento fica para a rota da agenda. |
| Cliente | Preferência pelo agente no WhatsApp | PWA com o histórico dele, para controle e transparência. Detalhe do que aparece no PWA fecha na rota do cliente. |

Uma conta é um negócio. Não existe troca de unidade.

## 2. Jornadas principais

A ordem da conversa é uma rota por vez. Serviço, agenda, comanda, pacote, consumo, sem nome e cliente de fora já estão fechados. O desenho dos cliques fica na fase de UI.

### Rota 1 — Serviço, agenda e comanda

Fechado nesta conversa:

- O dia do balcão começa na agenda.
- O cliente é da casa. Alguns ligam para o profissional e ele mesmo agenda.
- Serviço é o catálogo da casa. Não ocupa horário e não é comanda. Tem tempo de execução padrão. Na ficha do profissional, esse tempo pode ser outro para o mesmo serviço. O intervalo do horário é o tempo da ficha dele. Se ele não alterou, vale o padrão do serviço.
- Um horário de cliente tem um profissional, um serviço, um cliente da casa e um intervalo. O intervalo é o tempo daquele serviço na ficha daquele profissional.
- Bloqueio, almoço e período fechado são três indisponibilidades. Não são horário de cliente.
- Encaixe é um horário de cliente. Pode ficar por cima do almoço, do bloqueio, do período fechado e também de um horário já agendado. Serve para dois serviços ao mesmo tempo e para outro atendimento quando sobra tempo.
- A comanda é o pai operacional. Nela se vê e se opera: pacote, serviço, edição, troca de profissional.
- Uma comanda de atendimento junta várias linhas. Cada linha de serviço aponta para um profissional e, se veio da agenda, para um horário. Dois profissionais aparecem na mesma comanda e em duas colunas da agenda.
- Na agenda, o serviço aparece na coluna do profissional certo. Clicar no horário abre a mesma comanda daquele atendimento.
- No dia, o cliente tem uma única comanda. Ela guarda tudo: os serviços e os produtos. Não nasce uma segunda comanda para o produto.
- Produto vendido ao cliente gera comissão de produto para o profissional que vendeu. Isso não vale para o consumo do próprio profissional.
- Criar um horário cria a linha nessa comanda do dia. Se ela ainda não existe, nasce junto com o primeiro horário. Outro serviço, de outro profissional, entra na mesma comanda e cria o horário na coluna dele.
- Dois encaixes sobrepostos de clientes diferentes são duas comandas, uma por cliente. O mesmo cliente, no mesmo dia, não ganha a segunda.
- Comanda de consumo de profissional e comanda de serviço entre profissionais não são a comanda do cliente e não aparecem na agenda.
- Receber lança o pagamento nessa comanda do dia. Não abre outra.
- Fechar encerra a comanda do dia, com serviços e produtos juntos.
- Reabrir abre de novo essa mesma comanda. Não cria uma segunda no mesmo dia.
- Não fecha se houver linha de serviço sem profissional, ou linha de serviço sem horário na agenda. Produto pode ficar sem horário.
- Não fecha se os pagamentos não cobrirem o total. Mais de uma forma é permitida, cada uma com o seu valor. Pagamento parcial deixa a comanda aberta.
- Excluir linha ou trocar profissional só com a comanda aberta, ou depois de reabrir. O horário na agenda acompanha a linha.
- Na grade, cada estado tem cor e texto claros (exemplo: bloqueado em azul, com a palavra Bloqueado). No horário de cliente: nome completo, telefone, serviço e horário.
- Lista de espera é fila da IA. A espera se cancela sozinha quando a data passa.
- “Cliente chegou” é um estado do horário. A palavra no quadro é Chegou. Não abre comanda, não cobra e não bloqueia. Avisa que o cliente está na casa e já pode ser chamado.
- Em atendimento é outro estado. No sistema atual ele existe por dentro e aparece com o mesmo nome e a mesma cor de “no local”. No BeautyOS ele é visível. Quem liga é o profissional daquele horário, na partida. Aí começa a conta da espera, se Chegou já tinha sido marcado. Sem a partida, não há tempo medido.
- Cor e palavra de cada quadro da agenda:

| Quadro | Palavra | Cor |
|---|---|---|
| Agendado | Agendado | azul-claro |
| Confirmado | Confirmado | verde |
| Chegou | Chegou | rosa |
| Em atendimento | Em atendimento | laranja |
| Realizado | Realizado | verde-escuro |
| Bloqueado | Bloqueado | azul |
| Almoço | Almoço | cinza |
| Período fechado | Fechado | cinza-escuro |
| Ausente | Ausente | vermelho |
| Cancelado | Cancelado | cinza-claro, texto apagado |
| Encaixe | Encaixe | roxo |
| De fora | De fora | amarelo |

- Encaixe nasce roxo, com a palavra Encaixe nas informações, junto de nome completo, telefone, serviço e horário.
- Se esse horário for para Chegou, Em atendimento ou Realizado, a cor passa a ser a desse estado. A palavra Encaixe continua nas informações.
- Lista de espera não é quadro da grade. É fila da IA.

Rota do pacote fechada nesta conversa.

Relatório mínimo do pacote, já nesta rota. Relatórios mais completos ficam para depois:

- Quantos pacotes foram vendidos.
- Quais pacotes vendem mais.
- Quais serviços entram nesses pacotes.
- O valor vendido e a diferença em relação ao preço avulso.

Fechado nesta conversa, sobre pacote:

- O serviço tem preço avulso. O pacote tem o preço desse mesmo serviço dentro dele. A soma dos preços internos fecha o preço do pacote.
- No dia da venda, o caixa registra o preço do pacote. No uso, a comissão usa o preço interno. O cliente não paga essa linha de novo.
- A ida de hoje já é um uso, na comanda de hoje. As outras idas nascem como horário na agenda, ligadas a um crédito, ou ficam em “falta agendar”.
- A preferência de periodicidade (dia da semana, horário e profissional) gera esses horários. Cada um pode ser ajustado.
- O pacote tem validade em dias, definida no cadastro. A contagem começa no primeiro consumo, não na venda. Antes disso ele não vence.
- As idas já marcadas são a comprovação: o que foi feito, o que faltou e o que caiu fora do prazo.
- Se o prazo estoura, ou se uma ida marcada cai depois dele, abre o alerta: pacote vencido.
- Manter o valor é um perdão: o pacote continua ativo e o prazo renova pela mesma quantidade de dias do cadastro. A nova validade alcança a última ida que já está na agenda nesse momento. Aquele horário segue no preço interno.
- O perdão vale para aquele atraso. Se ainda existir ida depois da ida perdoada e o cliente atrasar de novo, abre outro alerta. O alerta mostra que já houve perdão e que esta é outra vez.
- Cada perdão fica registrado: pacote, cliente, data do prazo que estourou, data da ida atrasada e a ordem (primeira, segunda, e assim por diante). Semana perdida é o intervalo entre o prazo que estourou e a ida perdoada.
- O administrador vê um relatório desses perdões: quantas vezes ocorreu, quantas semanas se passaram do prazo até a ida perdoada, quantos clientes fizeram isso e quais repetem.
- Cobrar a diferença: o valor daquele horário na agenda passa para o preço avulso. O cliente paga a diferença entre o preço avulso e o preço interno, porque o pacote já foi pago na venda. O pacote é encerrado.

### Rota 2 — Consumo do profissional e serviço entre profissionais

Fechado nesta conversa:

- Nenhuma das duas entra na agenda. Nenhuma recebe dinheiro no caixa.
- Cada profissional tem uma comanda de consumo no dia. Abriu, vale até o fim do dia: produtos que ele pegou e serviços que ele recebeu.
- Fechar essa comanda não pede forma de pagamento. O fechamento é consumo interno. No movimento de caixa do dia a linha aparece, com valor zerado e esse nome. “Sem pagamento” ficaria parecendo comanda de cliente esquecida.
- Consumo de produto: baixa uma unidade do estoque, seja bomboniere ou produto de beleza. No controle de consumo entra o preço menos 30%. Esse valor abate a comissão de quem consumiu no fechamento do dia. Não gera comissão de produto.
- Comissão de produto existe só quando o profissional vende o produto para um cliente, na comanda desse cliente.
- Serviço entre profissionais: a comanda de consumo é de quem recebeu o serviço. O desconto não é uma taxa fixa do produto. A casa define. Quem executou recebe a comissão da ficha dele sobre o valor já com desconto e vê isso na própria comissão, não na agenda.
- No fim do dia ficam registrados o consumo, a comissão de quem executou (quando houver serviço) e o abate na comissão de quem consumiu.

Aberto nesta rota: nada. Comissão de serviço, comissão de produto, desconto entre profissionais e taxa de cartão serão definidos juntos, numa conversa só.

Ainda em aberto no fluxo: nada de regra. A fase seguinte é a UI, incluindo a ficha do profissional e a agenda, que compartilham o tempo do serviço.

### Rota 3 — Sem nome e cliente de fora

Fechado nesta conversa:

- Sem nome é a hora reservada, sem a pessoa cadastrada. O serviço pode começar. A comanda do dia nasce junto, provisória. No fim, o balcão pega os dados e cadastra o cliente da casa. Continua a mesma comanda e o mesmo horário. Não abre outra.
- Cliente de fora é outra coisa: alguém que apareceu por acaso, de outra cidade, e não volta. Entra na base com a marca De fora. Não se omite o cadastro para esconder do relatório.
- A visita dele conta no caixa do dia. Não entra na análise de quem deixou de voltar.
- Na agenda a palavra é De fora, cor amarela, a que o Luciano pediu. Não substitui Chegou, Em atendimento nem Realizado: nesses estados a cor muda e a palavra De fora continua, como no encaixe.
- Cadastrar o sem nome no fim, e marcar de fora, acontecem dentro da comanda, com poucos cliques. O desenho dessa tela fica na fase de UI, não agora.
- Entradas conhecidas na agenda: balcão, profissional na própria coluna, sem nome e de fora. Outra forma de carteira só entra se for dita.

### Rota 4 — Cliente

Fechado nesta conversa:

- O caminho principal é o agente no WhatsApp. Ele mostra créditos, validade e horários, e pode agendar, remarcar ou cancelar.
- O PWA mostra o mesmo histórico, para controle e transparência. Não opera a comanda da casa.
- A comanda, o pagamento e o perdão do pacote continuam no balcão. O cliente não fecha a própria comanda.

Fora desta fase: a UI desenha os cliques da comanda e revisa a ficha do profissional junto com a agenda.

### Comissão — fechada

Duas tabelas, como o Luciano mostrou no AppBarber. Não existe taxa fechada de custo para serviço entre profissionais. As telas da ficha do profissional e da agenda precisam ser revistas juntas, porque o tempo da ficha muda o tamanho do horário.

- Tabela do serviço e do produto: preço, tempo e percentual de comissão. É o padrão da casa. Ragnarok e Donna já têm a deles, puxada de lá.
- Tabela do profissional: os serviços que ele faz. Ao criar, pode puxar o padrão. Na ficha dele dá para mudar, naquele serviço, o preço, o tempo e a comissão, ou tirar um serviço que ele não executa. Na agenda, só aparecem os serviços dessa ficha.
- Venda avulsa: valem o preço, o tempo e a comissão da ficha do profissional. Se ele não alterou, vale a tabela do serviço. Se o balcão mudar o valor na linha, a comissão usa esse valor.
- Uso de pacote: o preço da ficha do profissional não entra. Quem manda no preço é o pacote, o preço daquele serviço dentro dele. A comissão continua a da ficha do profissional sobre esse preço. Dá para subir ou descer o percentual. Não dá para trocar o valor do item dentro do pacote por ali.
- Venda do pacote: a comissão de execução continua só no uso. Por padrão, vender não gera comissão. A casa pode ligar um incentivo a quem vendeu, sem mudar o preço do pacote. Isso é regra da casa, não do produto inteiro.
- Produto vendido ao cliente: a mesma hierarquia de comissão. Produto que o profissional consome: sem comissão, estoque baixa um, abate do preço menos 30% na comissão de quem consumiu. Os 30% são regra desta casa, no mesmo lugar em que a casa define o desconto do serviço entre profissionais.
- Serviço entre profissionais: não há percentual fixo no produto. A casa define o desconto. Quem executou recebe a comissão da ficha dele sobre o valor já com desconto. Quem recebeu tem esse valor abatido. Caixa zerado, consumo interno.
- Taxa de cartão: metade fica com a casa, metade sai da comissão de quem executou o que foi pago no cartão. A taxa aparece separada no caixa.
- Cortesia: não entra no caixa. A comissão permanece, sobre o valor da linha.
- Escada de extras é regra da casa, desligável. Ordinário não entra nela.
- Folga remunerada o aplicativo atual não fecha. Fica de fora até ser dita.
- Dois nomes de serviço para separar pacote e avulso não entram. O relatório é que separa venda, uso e preço avulso.

## 2.1 Briefing Luciano (antes destas decisões)

Fonte: gravação `85caaaca-bc32-48c9-af40-00fd02133491`. Não reabre o que já está fechado.

Já coberto pelo fluxo, e o briefing só confirma:

- Venda do pacote entra no caixa no dia. Comissão é no uso, sobre o valor do serviço dentro do pacote.
- Na comanda dá para abater o serviço de hoje como uso do pacote.
- Relatório de pacote precisa ser claro: quantidade, quais vendem, serviços, valor e diferença para o avulso.
- Editar comanda fechada não é livre. Só aberta, ou depois de reabrir.

Não usar como regra:

- Dois serviços no catálogo (“manicure” e “manicure pacote”). O BeautyOS tem um serviço e dois preços.
- Dividir o pacote sempre em partes iguais. A soma dos preços internos fecha o preço do pacote. A parte igual é só um caso.
- Impedir todo conflito de horário. O horário normal respeita a grade. O encaixe é a exceção que pode sobrepor.
- API do AppBarber como fonte de dados.

Guardar para a conversa certa:

- Comissão por serviço, com tempo, valor e comissão diferentes por profissional, puxados como padrão ao criar o profissional. Cabe na conversa única de comissão, junto com taxa de cartão e desconto entre profissionais. O “50% para a secretária” entra aí, não agora.
- Ao abrir a comanda, mostrar de forma visível que o cliente tem pacote. É detalhe da tela, não uma regra nova.
- “Cliente de fora” foi decidido na rota 3: entra na base com marca, conta no caixa, fica fora da análise de quem deixou de voltar. Cor amarela na agenda.
- Auditoria de troca de cliente e de valor alterado à mão. Entra quando formos à edição da comanda, não como rota agora.

## 3. Problemas herdados (padrão a decidir antes de codar)

Isto não é backlog do app atual. É o que o BeautyOS não pode repetir. Fonte: modelo e demandas do app-barbearia, mais os casos de balcão desta conversa.

1. **Unidade dentro da sessão.** O modelo tinha filial, usuário em vários tenants e persona de agente por unidade. A tela passou a misturar casas. No BeautyOS a conta é a casa. Quem trabalha em duas casas tem dois acessos, não um seletor.
2. **Agenda e comanda eram entidades certas e viraram a mesma gaveta.** O desenho dizia horário ≠ comanda. A operação abria comanda na agenda, vendia pacote no meio do serviço já feito e planejava visita no mesmo painel. A secretária ficou sem saída.
3. **Pacote com três caminhos.** Carteira (comissão no uso), atalho de recorrência na agenda (preço de tabela, corrigido depois) e combo que vira linha na venda (comissão na hora). O catálogo ainda duplicou o serviço (“Manicure” e “Manicure Recorrência”) para fingir a fatia.
4. **Comissão recalculada em vários lugares.** Na linha, no sync do mês, na taxa de cartão, na cortesia, zerada na venda do pacote. O caixa mostrou texto que ninguém entendia. A regra precisa nascer de um fato (serviço executado, produto vendido) e de uma configuração do administrador, não de um conserto posterior.
5. **Caixa, pagamento e comissão na mesma ação de fechar.** O caixa da tela era soma de pagamentos, com pergunta “inserir no caixa?”. Financeiro de verdade ficou para depois. Pagamento no BeautyOS é lançamento. Caixa, comissão e taxa são consequências, cada uma no seu módulo.
6. **Rótulo de pagamento no lugar da forma.** Pix, débito, crédito e “outros” conviveram com nomes de maquininha. Dividir dinheiro e cartão na mesma comanda chegou tarde e só numa das ações de pagar.
7. **Papel do sistema ≠ papel do balcão.** Havia dono, admin, gerente, equipe e somente leitura, e o profissional quase não mexia na comanda. O balcão precisava da operação inteira. O profissional precisava da agenda dele. O mapa de papéis desta seção substitui aquele.
8. **Agente, disparo e suporte no mesmo painel da casa.** Persona por unidade, fila de WhatsApp, confirmação automática e um segundo agente de suporte dividiram menu com a agenda. IA entra como módulo, com ajuste próprio, quando for a vez. Não como aba do caixa.
9. **AppBarber como fonte da verdade.** Import de duas unidades para o mesmo produto, e a interface puxou o menu de lá. O banco do BeautyOS descreve a casa, não o arquivo de exportação.
10. **Quatro ideias na mesma grade.** Encaixe, “estou na barbearia”, bloqueio de horário e lista de espera nasceram como flags do mesmo calendário. Cada uma precisa de nome próprio antes de virar botão.
11. **Cliente da casa e carteira do profissional.** O cliente era de todo mundo. Agora a carteira pode ser do profissional, e ele opera a agenda dele. Sem regra, ou o balcão perde o cliente, ou o profissional vê a casa inteira. Isto se decide na rota da agenda.
12. **Função que não desliga.** Tudo que entrava virava menu permanente. O administrador precisa do toggle por função, senão o cardápio de módulos vira o mesmo em toda empresa.

## 4. Diagrama

Ainda não. O diagrama sai quando a primeira rota fechar.

---

## Gaps & Recomendações (preencher só no Modo B — análise de repo existente)

Não se aplica como auditoria do código antigo. A seção 3 é a lista de padrão para o produto novo.
