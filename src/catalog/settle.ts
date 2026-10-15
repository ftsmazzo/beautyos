import { redirect, unstable_rethrow } from "next/navigation";
import { FormError, isUniqueViolation } from "@/catalog/errors";

function withError(base: string, code: string) {
  return `${base}${base.includes("?") ? "&" : "?"}erro=${code}`;
}

export async function settle(failBase: string, work: () => Promise<string>): Promise<never> {
  let next: string;
  try {
    next = await work();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof FormError) redirect(withError(failBase, error.code));
    if (isUniqueViolation(error)) redirect(withError(failBase, "codigo"));
    throw error;
  }
  redirect(next);
}
