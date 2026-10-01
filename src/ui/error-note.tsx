import { FORM_ERRORS } from "@/catalog/labels";

export function ErrorNote({ code }: { code?: string }) {
  if (!code || !FORM_ERRORS[code]) return null;
  return <p className="error banner">{FORM_ERRORS[code]}</p>;
}

export function SavedNote({ code }: { code?: string }) {
  if (code !== "salvo" && code !== "movimento") return null;
  return <p className="ok banner">{code === "movimento" ? "Movimento lançado no estoque." : "Cadastro salvo."}</p>;
}
