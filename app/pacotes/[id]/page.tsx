import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { centsToInput } from "@/catalog/format";
import { getPackage, listProducts, listServices } from "@/catalog/queries";
import { savePackage } from "@/catalog/package-actions";
import { ErrorNote } from "@/ui/error-note";
import { PackageForm, type PackageInitial } from "@/ui/package-form";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function PackageFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string }>;
}) {
  const user = await requireOperator();
  const { id } = await params;
  const query = await searchParams;
  const creating = id === "novo";
  if (!creating && !UUID.test(id)) redirect("/pacotes");
  const pack = creating ? null : await getPackage(user.accountId, id);
  if (!creating && !pack) redirect("/pacotes");
  const [services, products] = await Promise.all([listServices(user.accountId), listProducts(user.accountId)]);
  const visits = pack?.items.filter((item) => item.kind === "service") ?? [];
  const lines = pack?.items.filter((item) => item.kind === "product") ?? [];
  const groups = visits.reduce<{ serviceId: string; prices: string[] }[]>((list, item) => {
    const serviceId = item.serviceId ?? "";
    const last = list[list.length - 1];
    const price = centsToInput(item.internalPriceCents);
    if (last && last.serviceId === serviceId) last.prices.push(price);
    else list.push({ serviceId, prices: [price] });
    return list;
  }, []);
  const initial: PackageInitial = {
    id: pack?.id ?? "",
    name: pack?.name ?? "",
    notes: pack?.notes ?? "",
    forSale: pack?.forSale ?? true,
    validityDays: pack ? String(pack.validityDays) : "",
    saleCommission: pack?.saleCommissionPercent != null ? String(pack.saleCommissionPercent) : "",
    groups: groups.length ? groups : [{ serviceId: "", prices: [""] }],
    products: lines.map((item) => ({
      productId: item.productId ?? "",
      qty: String(item.qty),
      price: centsToInput(item.internalPriceCents),
    })),
  };

  return (
    <Panel user={user} current="/pacotes" title={pack ? pack.name : "Novo pacote"}>
      <ErrorNote code={query.erro} />
      <PackageForm
        action={savePackage}
        services={services.filter((service) => service.active || initial.groups.some((group) => group.serviceId === service.id)).map((service) => ({
          id: service.id,
          name: service.name,
          priceCents: service.priceCents,
        }))}
        products={products.filter((product) => product.active).map((product) => ({ id: product.id, name: product.name }))}
        initial={initial}
      />
    </Panel>
  );
}
