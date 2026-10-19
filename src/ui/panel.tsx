import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { SessionUser } from "@/auth/session";
import { moduleAllows } from "@/catalog/modules";
import { houseModules } from "@/catalog/queries";
import { PanelFrame } from "@/ui/panel-frame";

export async function Panel({
  user,
  current,
  title,
  children,
}: {
  user: SessionUser;
  current: string;
  title: string;
  children: React.ReactNode;
}) {
  const modules = await houseModules(user.accountId);
  const path = (await headers()).get("x-pathname") ?? current;
  if (!moduleAllows(modules, path)) redirect("/inicio");
  return (
    <PanelFrame user={user} current={current} title={title} modules={modules}>
      {children}
    </PanelFrame>
  );
}
