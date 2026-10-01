# Esquema Backend — BeautyOS

> Modelagem de dados e API.
> Fonte: [x] Entrevista com usuário  [x] Regras já fechadas no fluxo, não o banco do app-barbearia
> Depende de: [TRD](02-TRD.md), [Fluxo do App](03-FLUXO-APP.md)

**Data**: 2026-09-28
**Status**: espinha operacional fechada em 2026-09-28. Base para ir ao ar: cliente, profissional, serviço, produto, pacote, pacotes vendidos, agenda, comanda e o financeiro de hoje, replicado. Segundo sprint, depois do programa no ar: cupom, clube de assinatura, clube de clientes, promoções e pesquisa de satisfação. Painel de movimentações e relatórios de estoque seguem na fila. Não codar antes de abrir a implementação da base.

A lista acima é a relação que impede a comanda de quebrar. Não é o cadastro do AppBarber e não basta para relatório real.

## 1.1 Cadastro — como a ficha foi fechada

O aplicativo atual importou Donna e Ragnarok com ficha curta. Esta passada fechou cliente, profissional, serviço, produto, pacote e pacotes vendidos. A regra abaixo vale para o que ainda for aberto.

Regra antes de codar cada cadastro:

- A tela do AppBarber entra pelo que a função resolve. É um dos produtos que o mercado compra. O que ele fez bem fica. Em cima, a ficha tem de ser melhor, mais inteligente, mais funcional e mais fácil: o passo que nele ficou manual, duplicado ou espalhado em aba acontece numa passagem só.
- O uso da Ragnarok não decide. Campo vazio, categoria torta ou preço redigitado lá é o jeito controverso daquela base, não o desenho do BeautyOS.
- Função sai só quando a regra nossa já cobre melhor, e isso tem de estar dito por nós. Não sai porque um print veio em branco.
- A ficha nova tem coluna para o que entra em relatório. JSON não esconde preço, prazo, comissão, custo nem origem.
- Donna e Ragnarok continuam reconhecíveis na importação: o identificador de origem permanece. A ficha nova não encolhe para caber no que foi importado.
- A tela desse cadastro só nasce depois dessa lista. Não se desenha cadastro básico e se completa depois.

### Cliente e serviço — origem e volta (fechado)

- Canal de chegada é coluna do cliente: Instagram, WhatsApp, indicação, porta, Google ou não informado. Se o cliente novo não tiver canal, a comanda pergunta. Não trava o fechamento. Dá para pular, e “não informado” aparece no relatório.
- De fora não é canal. É a marca que tira a pessoa da análise de volta.
- Menu de Marketing é módulo, não campo. Disparo que o aplicativo já faz permanece. Agente no Instagram (post e direct) é função nova: quando a pessoa chega por ali, o canal é preenchido sozinho. O desenho desse menu espera a vez do módulo.
- Volta não é “30 dias para todo mundo”.
- Com pacote ativo, o prazo é a validade do pacote, contada do primeiro uso, e as idas já marcadas.
- Sem pacote, o intervalo de retorno fica na ficha do serviço, em dias. A data esperada é a última vez que aquele serviço foi feito, mais esse intervalo.
- O que se registra: voltou no prazo, passou e não voltou, renovou o pacote, não renovou e veio avulso, não renovou e não veio, de fora.

### Cliente — ficha (fechado)

Criar cliente pede nome e celular. O resto existe e não trava o balcão. E-mail, data de nascimento, foto e observação ficam no mesmo passo, porque aniversário e a cara da pessoa servem no dia. Canal de chegada é a lista já fechada. De fora e cadastro incompleto (o sem nome da comanda) são marcas visíveis, não texto solto.

Telefone fixo, CPF, RG, sexo e endereço ficam recolhidos. Servem para nota e para achar a pessoa. Não ocupam a criação.

“Como soube” em texto livre não volta: o canal já é coluna. Indicação guarda quem trouxe, profissional ou outro cliente. A casa tem um percentual de comissão para quem indicou. O campo já abre com esse percentual. Se este caso for diferente, grava-se o número dele. Essa comissão é de quem trouxe, por cima da comissão de quem executou.

A lista separa ativos e removidos. A pessoa pode sair e voltar. A busca é por nome e celular. A linha mostra nome, celular, canal, se é de fora, e há quantos dias não vem. Info abre a pessoa, não um formulário mudo.

A pessoa abre num resumo:

- Última visita: dia, serviço e profissional, com a comanda.
- Dias sem vir, só como fato. A volta de verdade é por serviço, na regra já fechada, e aparece ao lado: no prazo, passou, pacote, de fora.
- Serviço que mais faz e produto que mais leva, pelo nome do catálogo.
- Quanto já gastou, abrindo o histórico de comandas.
- Pacotes desta pessoa, na lista de pacotes vendidos já fechada.
- Histórico da agenda.
- Pontos, quando o módulo está ligado: saldo e extrato. O resgate é na comanda e gera o movimento. Não precisa de um código no meio.
- Conta do cliente: saldo a receber ou crédito, com o detalhe. Como a dívida nasce fica na fila financeira. O número na pessoa existe desde já.
- Cada visita pode ter uma avaliação: o texto, quem escreveu e quando. É o que o botão “Novo” do prontuário deles abre, e o que “Ver Anamnese” mostra. Nesta pessoa está vazio. A avaliação fica na visita, e a pessoa vê as visitas com esse texto. Não é ficha de saúde, e não é uma segunda lista da agenda.

### Profissional — leitura da ficha do AppBarber (fechado)

A ficha de lá tem sete abas. Categorias, remunerações e deduções não viram cadastro à parte porque a regra nossa já cobre: categoria é do serviço, remuneração é a comissão da linha, dedução nasce na comanda.

O que se aproveita:

- Pessoa: nome, apelido, celular, e-mail, foto, observação, se está ativa. Data de nascimento entra porque aniversário da equipe já é função da casa. Cor da coluna continua, para a agenda.
- Serviços dela: a tabela com comissão, tempo e valor em cada serviço. Célula vazia vale o catálogo. Serviço que ela não faz sai da lista. O tempo daqui é o tamanho do horário. O valor daqui vale no avulso. No uso de pacote, o preço interno do pacote manda e a comissão desta tabela continua.
- Horário fixo: cada dia da semana com até dois períodos. O buraco entre a saída do primeiro e a entrada do segundo é o almoço do dia comum. Fora desses períodos a coluna está fechada. Sábado mais curto, como no print, é só outro dia da mesma tabela.
- Horário por período: a mesma grade, valendo só entre duas datas. Serve para semana diferente, sem apagar o fixo.
- Acesso: a pessoa pode existir sem login. Se tiver login, o papel é balcão, administrador ou profissional. Desativar o login não apaga a ficha. Gestor não é uma caixa na pessoa: é o papel de administrador.

O que não volta nesta ficha:

- CPF, RG, sexo, telefone fixo e endereço. Não entram em agenda, comanda nem relatório de volta. Se um dia a casa pagar gente por aqui, isso nasce num bloco de pagamento, separado.
- Disponível na apresentação. É vitrine pública. Espera o módulo em que o cliente escolhe o profissional.
- Aba Categorias. Categoria é do serviço, não da pessoa. Atalho para marcar vários serviços de uma vez pode existir na tela, sem virar cadastro.
- Aba Remunerações. O que esta casa usa é a comissão da tabela de serviços, mais as regras já fechadas (pacote, cartão, consumo). Salário fixo e folga remunerada continuam fora até serem pedidos.
- Aba Deduções. Desconto de produto, serviço entre profissionais e metade da taxa nascem na comanda, não numa tabela parada na ficha. Por isso a aba está vazia.

Bloqueio continua sendo a indisponibilidade de um dia, diferente do horário fixo e do almoço que já está no intervalo entre os dois períodos. O intervalo de retorno fica no serviço. A ficha do profissional não repete esse número. Sem percentual geral. Sem unidade.

### Cadastro de serviço (fechado)

Uma ficha, sem aba. O que está vazio não ocupa a tela: desconto de dia e insumo só aparecem quando a casa adiciona. Salvar o serviço já grava quem executa. Não existe “criar o serviço” e depois “associar” em outro lugar.

O serviço em si:

- Nome, foto, observação, ativo, entra na agenda.
- Tempo padrão, preço avulso, comissão padrão.
- Volta em dias, ou “sem volta”. Sem volta não gera data. Com dias, a data esperada é a execução mais esse intervalo, no caminho sem pacote.
- Participa da meta de extras: sim ou não. Avulso não é categoria. Cortesia, recorrência, promoção e diferença não são outro serviço nem outro nome.
- Grupo opcional, só para ordenar a lista (Barba, Cabelo). Se ninguém preencher, a lista é uma só.

Quem executa é a mesma linha da ficha do profissional: comissão, tempo e valor. A célula mostra o número que vai valer. Se for o do catálogo, está marcado como padrão. Mudar grava o ajuste. Limpar volta ao padrão. Tirar a pessoa tira dos dois lados. O tempo dessa linha é o horário. No uso de pacote, o preço interno manda e a comissão da linha continua. Valor próprio da pessoa não entra no pacote.

Preço vigente e a próxima troca ficam no mesmo bloco. A casa marca o valor novo e a data. Na data, o preço avulso troca sozinho e a casa é avisada. Horário anterior à data guarda o valor com que foi marcado. Horário da data em diante usa o novo. Comissão, tempo, preço de pacote e valor próprio de quem não está no padrão não mudam. Quem está no padrão acompanha o catálogo.

Desconto de dia, se existir: dia da semana, o dia inteiro ou um intervalo de hora, e um valor ou um percentual, em cima do avulso. Horário já marcado não muda. Pacote não entra. A comissão usa o valor cobrado na linha.

Insumo, se existir: produto e quantidade. Quando o serviço é realizado, essa quantidade sai do estoque na comanda como uso do serviço. Não cobra o cliente, não gera comissão e não desconta o profissional. A ficha do produto, na próxima passada, continua dona da venda e do estoque.

Não entram: tipo de preço, simultâneos, botão de aplicar preço no dia e unidade. Aparecer para o cliente e pontos ficam nos mesmos interruptores do produto.

### Produto e estoque (fechado)

A função do painel deles permanece: lista com quantidade e preço, entrada e saída rápidas, histórico, compra por nota, fornecedor, preço de profissional, mínimo, código de barras, categoria, comissão, combo, conferência, apresentação e fidelidade. A ficha nova faz isso numa passagem só, com o número certo já aparecendo.

O produto:

- Nome, marca, categoria, observação, foto, código de barras, ativo.
- Vende ao cliente e serve de insumo são dois fatos. Os dois podem ser sim. Só insumo não aparece na venda. A categoria organiza (bebida, barba, comida). Ela não carrega “pra venda” nem “para uso” no nome.
- Preço de venda, comissão padrão, custo e margem. O custo sobe sozinho na compra. A margem é preço menos custo.
- Preço para o profissional. A casa tem um percentual único (o desconto de consumo já fechado). O campo já abre com esse valor, marcado como padrão. Se este produto for diferente, digita-se o valor dele e ele deixa de seguir o percentual. Mudou o percentual da casa, só o padrão acompanha.
- Mínimo. A lista marca quem chegou nele, sem relatório à parte.
- Fornecedor de costume, para a compra já vir preenchida.
- Aparece para o cliente, e se o preço aparece. Vale quando a superfície do cliente existir.
- Fidelidade, no módulo: acumula pontos (quantos) e resgata (por quantos). Desligado, some da tela. Ligado, os dois números ficam no produto.
- Comissão por profissional, na mesma linha do serviço: a célula mostra o número que vale. Padrão é o do produto. Ajuste grava. Limpar volta ao padrão.

Quantidade não se edita num campo solto. Cada mudança é movimento com motivo: venda, uso no serviço, consumo do profissional, compra, ajuste, conferência. O saldo é a soma. Mais e menos continuam na lista, e já perguntam o motivo. Conferência é um modo da lista: conta, mostra a diferença, confirma, e a diferença vira ajuste com data e quem contou.

Venda ao cliente cobra, paga a comissão do produto e baixa o estoque. Consumo do profissional baixa o estoque, não paga comissão e desconta o preço de profissional da comissão dele. Uso no serviço baixa a quantidade do insumo, não cobra e não desconta ninguém.

Fornecedor é ficha curta: nome, telefone, CNPJ, cidade. O restante do endereço fica se quiserem. O produto aponta para ele.

Compra abre no painel e mostra um código para o celular da casa. O celular só fotografa o cupom, a nota ou o recibo. A leitura volta para a mesma compra.

Cupom e nota fiscal já trazem um código oficial. Por ele o sistema puxa os itens, as quantidades e os valores, sem adivinhar letra. Recibo sem esse código é lido pela foto, e a lista nasce para conferir, não para entrar sozinha.

Cada linha sugere o produto da casa. A descrição do fornecedor quase nunca é igual à nossa. A pessoa confirma, troca ou cria o produto. Na próxima compra daquele fornecedor, a mesma descrição já cai no produto certo. Preço de venda e comissão não mudam. O valor da nota vira custo daquela entrada. Salvar grava o movimento, atualiza o custo e o fornecedor (nome e CNPJ que vieram no documento, se ainda não existiam). A mesma nota não entra duas vezes.

“Lançar em contas a pagar” continua um interruptor. Ligado, pede vencimento e em quantas vezes. Se já pagou, pede a forma. Bandeira só aparece se a forma for cartão. Sem papel na mão, a compra ainda pode ser digitada: produto, quantidade, custo, fornecedor e data.

Combo é um produto feito de outros: nome, preço, comissão e os itens com quantidade. Na venda, saem os componentes. A composição fica nesta ficha, não numa aba separada da vida do produto.

O serviço usa os mesmos interruptores de aparecer para o cliente e de pontos, para o catálogo não divergir.

### Financeiro (fechado — replicar o módulo de hoje)

O módulo atual entra na base como está. Foi feito à parte e já cobre tesouraria, contas a pagar, contas a receber, bancos, cartões, plano de contas, parcelas, recorrência, fluxo de caixa, DRE e as calculadoras. O caixa do balcão continua separado do banco. A compra pode lançar em contas a pagar. A conta do cliente aparece no a receber.

Ajuste fino fica para depois, em cima do que estiver rodando. A filial que o módulo de hoje carrega não vem: uma conta é um negócio.

### Fila — segundo sprint, depois do programa no ar

A base precisa estar rodando antes. Estes itens não entram nela:

- Cupom de desconto e clube de assinatura.
- Clube de clientes, promoções e pesquisa de satisfação.
- Painel para manusear e conferir movimentações.
- Relatórios de compras, custo, margem e o restante do estoque.

### Pacote (fechado)

A ficha deles tem nome, observação, foto, comissão pela venda, dias para expirar, se está à venda, se aparece no app, se gera pontos, se aceita pagamento online e em até quantas parcelas. O item é tipo, qual serviço ou produto, quantidade de sessões e um valor. A lista mostra o total, a data e um interruptor de disponível. No exemplo, “5 BARBAS” aponta para “Barba Recorrência”, 5 sessões a R$ 21,67, e o total do pacote está R$ 95,01. A conta não fecha. O nome do serviço foi duplicado para caber no pacote.

O que já está fechado continua. Um serviço só, com preço avulso e preço interno. A soma dos preços internos é o preço do pacote. A validade em dias começa no primeiro uso. A venda entra no caixa no dia, comissão zero, salvo se a casa ligar um incentivo. No uso, a comissão é o percentual do profissional sobre o preço interno. O preço próprio do profissional não entra. As outras idas nascem na venda, no dia e hora combinados, ou ficam em falta agendar.

A ficha nova é uma tela:

- Nome, observação, foto, à venda. O interruptor de à venda fica também na lista.
- Dias de validade, com a frase de que o prazo corre a partir do primeiro uso.
- Comissão pela venda. Em branco, é zero. Preenchida, é o incentivo daquela venda.
- Aparece para o cliente, e pontos, nos mesmos interruptores do produto.
- Itens. O serviço é o do catálogo, Barba, não uma cópia. Quantidade de idas e o preço interno de cada uma. Dá para incluir produto: quantidade e o valor dele dentro do pacote. A soma aparece o tempo todo e é o preço. Não salva se não fechar. Dividir o total em partes iguais é um atalho, não a regra.
- Ao lado de cada serviço, o avulso e a diferença. A lista do pacote mostra essa diferença, para o desconto não precisar morar no nome.

Produto dentro do pacote entra no preço. O estoque desse produto sai na venda. Não vira ida na agenda e não gera comissão além do incentivo, se houver.

Pagamento online e quantidade máxima de parcelas não entram. A venda do pacote é na comanda, e a comanda já aceita mais de uma forma. Não há gateway. Se o cliente ficar devendo uma parte, isso é conta a receber, na fila financeira.

### Pacotes vendidos (fechado)

A tela deles é uma lista de vendas, não um relatório. Dá para esconder coluna até sobrar só o nome e um botão ver. Com as colunas abertas aparecem cliente, sessões, usadas, celular, expiração, um valor chamado crédito e a forma de pagamento. Há abas de ativas, concluídas, canceladas e expiradas. O detalhe mostra “1 de 2 utilizado”, o serviço, o profissional, a quantidade e um link para a comanda. Também vendem, editam e cancelam por ali.

A lista nova não esconde o que a operação precisa. Cada venda mostra: cliente, telefone, pacote, usadas de um total, próxima ida ou “falta agendar”, situação do prazo e o valor pago. O prazo diz “ainda não começou” enquanto ninguém usou, porque o relógio só corre no primeiro uso. O valor pago é o da venda. O que resta são as idas, cada uma com o preço interno. Não existe uma coluna de crédito que ora é zero, ora é outro número.

Filtros na mesma lista: ativas, concluídas, canceladas, expiradas, estouradas sem perdão, perdoadas e falta agendar.

O detalhe é a lista de idas. Cada ida feita abre a comanda. Ida marcada mostra dia, hora e profissional. Ida sem horário é falta agendar, e dali dá para marcar ou usar na hora: usar na hora abre a comanda do dia e consome essa ida. Não se acrescenta sessão além das que o pacote vendeu.

Depois de vendido, o preço, os itens e a comissão daquela venda ficam como foram. Dá para remarcar ida, registrar perdão ou cobrar a diferença, nas regras já fechadas. Cancelar pede motivo. O que já foi feito permanece. O que não foi usado sai, e o estorno entra no caixa.

Vender pacote continua na comanda. Esta tela pode abrir essa venda, sem um segundo caixa.

O relatório é outra tela, curta. No período: quantos vendidos, quais mais saem, serviços, valor e a diferença para o avulso. Ao lado, os perdões: quantos, semanas perdidas, clientes e quem repete.

Dinheiro em centavos. Uma conta é um negócio. Nada aqui mistura duas casas.

## 1. Entidades principais

| Entidade | Campos-chave | Relacionamentos |
|---|---|---|
| Conta | nome, plano, módulos ligados | Pai de tudo que é da casa. Sem filial dentro da sessão. |
| Usuário | e-mail, papel | Uma conta. Papéis: balcão, administrador, profissional, cliente. |
| Profissional | nome, ativo | Pode ter usuário. Tem a ficha de serviços. |
| Serviço | nome, preço avulso, tempo, comissão, volta ou sem volta, meta de extras | Catálogo. Uma ficha. Preço troca sozinho na data marcada. |
| ProfissionalServiço | preço, tempo, comissão, se executa | Override da ficha. O tempo daqui é o intervalo da agenda. Se vazio, vale o serviço. |
| Produto | nome, preço, preço do profissional, custo, mínimo, vende, insumo | Saldo só muda por movimento. Compra atualiza custo e pode gerar conta a pagar. |
| Cliente | nome, celular, canal, de fora, quem indicou | Resumo abre visita, volta por serviço, pacotes, conta e avaliação da visita. |
| Indisponibilidade | profissional, início, fim, tipo | Tipo: bloqueio, almoço ou período fechado. Não é horário de cliente. |
| Horário | profissional, serviço, cliente, início, fim, estado, encaixe | Fim menos início = tempo da ficha. Estados com palavra e cor já fechados. Encaixe pode sobrepor. Clique abre a comanda do dia. |
| Espera | cliente, serviço, profissional, dia | Fila da IA. Cancela sozinha quando a data passa. Não é quadro da grade. |
| Comanda | cliente ou profissional, dia, tipo, estado | Uma por cliente no dia (serviços e produtos). Uma de consumo por profissional no dia. Tipo consumo fecha como consumo interno. |
| Linha | comanda, tipo, profissional, horário, valores | Serviço exige profissional e horário. Produto pode não ter horário. Pacote vendido não cria horário. Uso de crédito zera a cobrança e guarda o preço interno para a comissão. |
| Pacote | preço, dias de validade, incentivo de venda opcional | Itens apontam para o serviço único, com preço interno. A soma dos preços internos fecha o preço do pacote. |
| PacoteDoCliente | cliente, pacote, vendido em, primeiro uso, validade, estado | O relógio dos dias começa no primeiro uso. Perdão renova e alcança a última ida já marcada. Cobrar a diferença encerra. |
| Crédito | pacote do cliente, serviço, preço interno, horário ou falta agendar | Ida de hoje já nasce usada. As outras nascem horário ou ficam em falta agendar. |
| Perdão | pacote, cliente, prazo estourado, ida, ordem | Base do relatório de semanas perdidas e de quem repete. |
| Pagamento | comanda, forma, valor | Lançamento. Várias formas. Não opera Pix nem cartão. A comanda de cliente só fecha se a soma cobrir o total. |
| MovimentoDeCaixa | dia, valor, origem | Consumo interno entra com valor zero e esse nome. Pagamento de cliente entra com valor. |
| Comissão | profissional, linha, base, percentual, valor, abate, metade da taxa | Nasce do fato da linha. Não é recalculada em outro lugar para “consertar”. |
| Auditoria | quem, o que, comanda, antes, depois | Troca de cliente e valor alterado à mão. |

## 2. Autenticação e autorização

- Método: sessão própria. E-mail para recuperar senha. Sem login social nesta fase.
- Balcão: operação do dia, inclusive a comanda e a agenda da casa.
- Administrador: o que o balcão faz, mais comissão, taxa, financeiro e o interruptor de módulos.
- Profissional: a própria agenda, o próprio consumo, a própria comissão. Agenda, edita, encaixa e cancela os próprios horários.
- Cliente: agente e PWA. Vê a própria história, créditos, validade e horários. Não opera a comanda da casa.

## 3. Endpoints/ações principais

| Endpoint/Ação | Método | Autenticado? | Regra de negócio relevante |
|---|---|---|---|
| Criar horário | escrita | sim | Puxa o tempo da ficha. Cria a linha na comanda do dia do cliente. Se não existir, nasce junto. |
| Encaixe | escrita | sim | Pode sobrepor almoço, bloqueio, período fechado e outro horário. |
| Abrir comanda do dia | escrita | sim | Uma por cliente. Produto sem horário pode abri-la. Serviço sem horário não fecha. |
| Abater na comanda | escrita | sim | A linha de hoje vira o primeiro uso. Não cria outro horário. |
| Planejar idas | escrita | sim | Preferência de dia, hora e profissional gera horários ligados a créditos, sem comanda futura. |
| Receber | escrita | sim | Lança formas e valores na mesma comanda. Parcial deixa aberta. |
| Fechar | escrita | sim | Exige profissional e horário em cada serviço, e pagamentos cobrindo o total. |
| Reabrir | escrita | sim | A mesma comanda do dia. Não cria outra. |
| Fechar consumo | escrita | sim | Sem forma de pagamento. Movimento zerado, nome consumo interno. |
| Perdão ou diferença | escrita | sim | Manter renova o prazo. Diferença muda o horário para o avulso e encerra o pacote. |
| Webhook do WhatsApp | escrita | token do canal | Agente. Não é sessão de balcão. |

## 4. Processamento assíncrono

- Webhook do WhatsApp e resposta do agente.
- Aviso quando um horário da espera vaga. Limpeza da espera no dia seguinte.
- Alerta de pacote vencido quando uma ida marcada cai fora do prazo.
- E-mail de notificação e de senha.
- Lembrete de aniversariante, porque a função já existe no aplicativo atual e permanece.
- Sugestão: fila simples no mesmo app. Sem outro serviço enquanto uma conta só está em validação.

## 5. Armazenamento

- Tipo de dados: Postgres da conta, estruturado. Conversa de WhatsApp é dado sensível, na mesma conta, invisível para outra casa.
- Foto de cliente, se entrar, é arquivo. Não é o núcleo desta fase.
- Volume: uma conta primeiro. O desenho já isola por conta para as próximas.

---

## Gaps & Recomendações (preencher só no Modo B — análise de repo existente)

Não se aplica. O banco do app-barbearia não é migrado para cá como estrutura. As funções dele permanecem. As relações são as deste documento.
