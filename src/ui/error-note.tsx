import { FORM_ERRORS } from "@/catalog/labels";

export function ErrorNote({ code }: { code?: string }) {
  if (!code || !FORM_ERRORS[code]) return null;
  return <p className="error banner">{FORM_ERRORS[code]}</p>;
}

export function SavedNote({ code }: { code?: string }) {
  if (code !== "salvo" && code !== "movimento" && code !== "compra" && code !== "banco") return null;
  const text =
    code === "compra"
      ? "Compra lançada no estoque."
      : code === "movimento"
        ? "Movimento lançado no estoque."
        : code === "banco"
          ? "Banco salvo."
          : "Cadastro salvo.";
  return <p className="ok banner">{text}</p>;
}
