export const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const CHANNELS = [
  { value: "nao_informado", label: "Não informado" },
  { value: "instagram", label: "Instagram" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "indicacao", label: "Indicação" },
  { value: "porta", label: "Porta" },
  { value: "google", label: "Google" },
] as const;

export const STOCK_REASONS: Record<string, string> = {
  venda: "Venda",
  uso: "Uso no serviço",
  consumo: "Consumo",
  compra: "Compra",
  ajuste: "Ajuste",
  conferencia: "Conferência",
};

export function channelLabel(value: string) {
  return CHANNELS.find((item) => item.value === value)?.label ?? value;
}

export const FORM_ERRORS: Record<string, string> = {
  dados: "Revise os campos obrigatórios.",
  horario: "Revise os horários. Cada período precisa de início e fim, e os dois não se cruzam.",
  periodo: "O horário por período precisa das duas datas e de pelo menos um expediente.",
  login: "Esse acesso não pode ser ligado a este profissional.",
  quem: "Na indicação, informe quem trouxe a pessoa.",
  volta: "Marque sem volta ou informe os dias.",
  preco: "A próxima troca precisa do valor e de uma data de hoje em diante.",
  papel: "Marque se vende ao cliente, se é insumo, ou os dois.",
  codigo: "Esse código de barras já está em outro produto.",
  ciclo: "Esse item já contém este produto.",
  igual: "A contagem fechou igual ao saldo.",
  estoque: "Revise a quantidade deste movimento.",
  soma: "Inclua um serviço e o preço interno de cada ida.",
  desconto: "O desconto precisa do dia e do valor, com o horário completo ou o dia inteiro.",
  insumo: "O insumo precisa do produto e da quantidade.",
  fora: "Não encontrei este cadastro nesta casa.",
  hora: "Informe um horário válido.",
  fechado: "Esse horário está fora do expediente. Encaixe entra mesmo assim.",
  almoco: "Esse horário cai no almoço. Encaixe entra mesmo assim.",
  ocupado: "Esse horário já está ocupado. Encaixe pode sobrepor.",
  fechada: "A comanda desse dia está fechada. Reabra para alterar.",
  pagamento: "Os pagamentos ainda não cobrem o total.",
  falta: "Todo serviço precisa de profissional e de horário na agenda para fechar.",
  cliente: "Escolha um cliente desta casa.",
  servico: "Esse profissional não faz este serviço.",
  pacote: "Esse pacote não pode ser alterado por aqui.",
  outra: "Esse pacote já teve visita usada em outra comanda.",
  credito: "Não há visita disponível desse serviço no pacote.",
};
