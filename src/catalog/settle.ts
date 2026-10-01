import { redirect, unstable_rethrow } from "next/navigation";
import { FormError, isUniqueViolation } from "@/catalog/errors";

export async function settle(failBase: string, work: () => Promise<string>): Promise<never> {
  let next: string;
  try {
    next = await work();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof FormError) redirect(`${failBase}?erro=${error.code}`);
    if (isUniqueViolation(error)) redirect(`${failBase}?erro=codigo`);
    throw error;
  }
  redirect(next);
}
