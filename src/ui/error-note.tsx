import { FORM_ERRORS } from "@/catalog/labels";

export function ErrorNote({ code }: { code?: string }) {
  if (!code || !FORM_ERRORS[code]) return null;
  return <p className="error">{FORM_ERRORS[code]}</p>;
}
