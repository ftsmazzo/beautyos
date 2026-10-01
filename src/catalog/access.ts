import { redirect } from "next/navigation";
import { currentUser, type SessionUser } from "@/auth/session";

export async function requireOperator(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (user.role !== "administrador" && user.role !== "balcao") redirect("/inicio");
  return user;
}
