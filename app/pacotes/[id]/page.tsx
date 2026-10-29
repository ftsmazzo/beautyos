import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { centsToInput, formatReais } from "@/catalog/format";
import { getPackage, listProducts, listServices } from "@/catalog/queries";
import { savePackage } from "@/catalog/package-actions";
import { ErrorNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
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

  const serviceName = new Map(services.map((service) => [service.id, service.name]));
  const productName = new Map(products.map((product) => [product.id, product.name]));
  const visitRows = visits.reduce<{ key: string; name: string; count: number; cents: number }[]>((list, item) => {
    const serviceId = item.serviceId ?? "";
    const last = list[list.length - 1];
    if (last && last.key === serviceId) {
      last.count += 1;
      last.cents += item.internalPriceCents;
      return list;
    }
    list.push({
      key: serviceId,
      name: serviceName.get(serviceId) ?? "Serviço",
      count: 1,
      cents: item.internalPriceCents,
    });
    return list;
  }, []);
  const packageCents = (pack?.items ?? []).reduce((sum, item) => sum + item.internalPriceCents, 0);
  const avulsoCents = visits.reduce((sum, item) => {
    const service = services.find((row) => row.id === item.serviceId);
    return sum + (service?.priceCents ?? 0);
  }, 0);
  const editor = (
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
  );

  return (
    <Panel user={user} current="/pacotes" title={pack ? pack.name : "Novo pacote"}>
      <ErrorNote code={query.erro} />
      {pack ? (
        <div className="desk">
          <div className="desk-bar">
            <span className="badge bg-secondary-lt">{formatReais(packageCents)}</span>
            {avulsoCents > 0 ? <span className="badge bg-secondary-lt">Avulso {formatReais(avulsoCents)}</span> : null}
            <span className="badge bg-secondary-lt">{pack.validityDays} dias</span>
            <span className="badge bg-secondary-lt">{pack.forSale ? "À venda" : "Fora de venda"}</span>
            {pack.saleCommissionPercent != null ? <span className="badge bg-secondary-lt">{pack.saleCommissionPercent}% venda</span> : null}
            <Modal label="Editar" title={`Editar · ${pack.name}`} tone="navy">
              {editor}
            </Modal>
          </div>
          <div className="queue" style={{ overflowX: "auto" }}>
            {visitRows.length === 0 ? <p className="queue-empty">Nenhuma ida.</p> : null}
            {visitRows.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Serviço</th>
                    <th>Idas</th>
                    <th>No pacote</th>
                  </tr>
                </thead>
                <tbody>
                  {visitRows.map((row) => (
                    <tr key={row.key}>
                      <td>{row.name}</td>
                      <td>{row.count}</td>
                      <td>{formatReais(row.cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
          {lines.length > 0 ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="desk-bar"><span className="day-label">Produtos</span></div>
              <table>
                <tbody>
                  {lines.map((item, index) => (
                    <tr key={`${item.productId ?? "produto"}-${index}`}>
                      <td>{productName.get(item.productId ?? "") ?? "Produto"}</td>
                      <td>{item.qty}</td>
                      <td>{formatReais(item.internalPriceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : (
        editor
      )}
    </Panel>
  );
}
