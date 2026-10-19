export const HOUSE_MODULES = [
  { id: "caixa", label: "Caixa" },
  { id: "comissao", label: "Comissão" },
  { id: "logs", label: "Logs" },
  { id: "volta", label: "Volta" },
  { id: "produtos", label: "Produtos e fornecedores" },
  { id: "pacotes", label: "Pacotes" },
  { id: "financeiro", label: "Financeiro" },
] as const;

export type HouseModuleId = (typeof HOUSE_MODULES)[number]["id"];

export function moduleAllows(modules: Record<HouseModuleId, boolean>, path: string) {
  if (path === "/caixa" || path.startsWith("/caixa/")) return modules.caixa;
  if (path === "/comissao" || path.startsWith("/comissao/")) return modules.comissao;
  if (path === "/logs" || path.startsWith("/logs/")) return modules.logs;
  if (path === "/volta" || path.startsWith("/volta/")) return modules.volta;
  if (path === "/produtos" || path.startsWith("/produtos/") || path === "/fornecedores" || path.startsWith("/fornecedores/")) return modules.produtos;
  if (path === "/pacotes" || path.startsWith("/pacotes/")) return modules.pacotes;
  if (path === "/financeiro" || path.startsWith("/financeiro/")) return modules.financeiro;
  return true;
}
