import { redirect } from "next/navigation";
import { requireOperator } from "@/catalog/access";
import { WEEKDAYS } from "@/catalog/labels";
import { centsToInput, formatDay, formatReais } from "@/catalog/format";
import { getService, listDiscounts, listProducts, listProfessionals, listServiceLinks, listSupplies, serviceGroups } from "@/catalog/queries";
import { saveService } from "@/catalog/service-actions";
import { ErrorNote } from "@/ui/error-note";
import { RosterShortcut } from "@/ui/roster-shortcut";
import { StandardField } from "@/ui/standard-field";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ServiceFormPage({
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
  if (!creating && !UUID.test(id)) redirect("/servicos");
  const service = creating ? null : await getService(user.accountId, id);
  if (!creating && !service) redirect("/servicos");
  const [groups, discounts, supplies, products, people, links] = await Promise.all([
    serviceGroups(user.accountId),
    service ? listDiscounts(service.id) : Promise.resolve([]),
    service ? listSupplies(service.id) : Promise.resolve([]),
    listProducts(user.accountId),
    listProfessionals(user.accountId),
    service ? listServiceLinks(service.id) : Promise.resolve([]),
  ]);
  const linked = new Map(links.map((row) => [row.professionalId, row]));
  const roster = people.filter((person) => person.active || linked.has(person.id));

  return (
    <Panel user={user} current="/servicos" title={service ? service.name : "Novo serviço"}>
      <ErrorNote code={query.erro} />
      <form action={saveService}>
        {service ? <input type="hidden" name="id" value={service.id} /> : null}
        <label>
          Nome
          <input name="name" required minLength={2} defaultValue={service?.name ?? ""} />
        </label>
        <label>
          Grupo
          <input name="group" list="grupos" defaultValue={service?.menuGroup ?? ""} placeholder="Barba, cabelo…" />
          <datalist id="grupos">
            {groups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
        </label>
        <label>
          Observação
          <textarea name="notes" defaultValue={service?.notes ?? ""} />
        </label>
        <div className="row">
          <label className="check">
            <input type="checkbox" name="active" value="1" defaultChecked={service?.active ?? true} />
            Ativo
          </label>
          <label className="check">
            <input type="checkbox" name="bookable" value="1" defaultChecked={service?.bookable ?? true} />
            Entra na agenda
          </label>
          <label className="check">
            <input type="checkbox" name="extras" value="1" defaultChecked={service?.extrasGoal ?? false} />
            Participa da meta de extras
          </label>
        </div>
        <div className="split">
          <label>
            Tempo padrão (min)
            <input name="duration" type="number" required min={5} max={480} defaultValue={service?.durationMin ?? 30} />
          </label>
          <label>
            Preço avulso
            <input name="price" required defaultValue={service ? centsToInput(service.priceCents) : ""} placeholder="0,00" />
          </label>
          <label>
            Comissão padrão (%)
            <input name="commission" required inputMode="numeric" defaultValue={service?.commissionPercent ?? 0} />
          </label>
        </div>
        <div className="split">
          <label className="check">
            <input type="checkbox" name="no_return" value="1" defaultChecked={service ? service.returnDays == null : false} />
            Sem volta
          </label>
          <label>
            Volta em dias
            <input name="return_days" type="number" min={1} max={3650} defaultValue={service?.returnDays ?? ""} />
          </label>
        </div>
        <h2>Quem executa</h2>
        <p>A célula mostra o número que vale. Padrão segue este serviço e acompanha quando o catálogo muda. Mudar grava o ajuste. Limpar volta ao padrão. Tirar a pessoa tira dos dois lados.</p>
        <RosterShortcut checkName="does" />
        {roster.length === 0 ? <p>Cadastre um profissional para montar esta tabela.</p> : null}
        {roster.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Faz</th>
                <th>Pessoa</th>
                <th>Preço</th>
                <th>Tempo</th>
                <th>Comissão</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((person) => {
                const link = linked.get(person.id);
                return (
                  <tr key={person.id}>
                    <td>
                      <input type="hidden" name="shown" value={person.id} />
                      <input type="checkbox" name="does" value={person.id} defaultChecked={Boolean(link)} />
                    </td>
                    <td>
                      {person.nickname || person.name}
                      {person.active ? "" : " · inativo"}
                    </td>
                    <td>
                      <StandardField
                        name={`price_${person.id}`}
                        mode="reais"
                        label={`Preço de ${person.nickname || person.name}`}
                        standard={service ? centsToInput(service.priceCents) : "0,00"}
                        stored={link?.priceCents != null ? centsToInput(link.priceCents) : ""}
                      />
                    </td>
                    <td>
                      <StandardField
                        name={`duration_${person.id}`}
                        mode="int"
                        label={`Tempo de ${person.nickname || person.name}`}
                        standard={String(service?.durationMin ?? 30)}
                        stored={link?.durationMin != null ? String(link.durationMin) : ""}
                      />
                    </td>
                    <td>
                      <StandardField
                        name={`commission_${person.id}`}
                        mode="int"
                        label={`Comissão de ${person.nickname || person.name}`}
                        standard={String(service?.commissionPercent ?? 0)}
                        stored={link?.commissionPercent != null ? String(link.commissionPercent) : ""}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
        <h2>Próxima troca de preço</h2>
        <p>Na data, o avulso troca. Comissão, tempo, pacote e valor próprio de quem não está no padrão ficam.</p>
        {service?.priceChangedOn ? <p>Preço avulso em vigor desde {formatDay(service.priceChangedOn)}.</p> : null}
        <div className="split">
          <label>
            Novo avulso
            <input name="next_price" defaultValue={service?.nextPriceCents != null ? centsToInput(service.nextPriceCents) : ""} placeholder="0,00" />
          </label>
          <label>
            A partir de
            <input name="next_on" type="date" defaultValue={service?.nextPriceOn ?? ""} />
          </label>
        </div>
        <h2>Desconto de dia</h2>
        <p>Vale no avulso. Horário já marcado e pacote ficam de fora.</p>
        {discounts.map((discount) => (
          <label className="check" key={discount.id}>
            <input type="checkbox" name="drop_discount" value={discount.id} />
            Tirar {WEEKDAYS[discount.weekday]}
            {discount.startTime ? ` ${discount.startTime}–${discount.endTime}` : " o dia inteiro"}
            {" · "}
            {discount.mode === "percentual" ? `${discount.amount}%` : formatReais(discount.amount)}
          </label>
        ))}
        <div className="split">
          <label>
            Dia
            <select name="new_weekday" defaultValue="">
              <option value="">Não incluir</option>
              {WEEKDAYS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Início
            <input name="new_start" type="time" />
          </label>
          <label>
            Fim
            <input name="new_end" type="time" />
          </label>
          <label>
            Modo
            <select name="new_mode" defaultValue="percentual">
              <option value="percentual">Percentual</option>
              <option value="valor">Valor</option>
            </select>
          </label>
          <label>
            Desconto
            <input name="new_amount" placeholder="0" />
          </label>
        </div>
        <h2>Insumo</h2>
        <p>Na realização, esta quantidade sai do estoque. Não cobra, não gera comissão e não desconta o profissional.</p>
        {supplies.map((supply) => (
          <label className="check" key={supply.productId}>
            <input type="checkbox" name="drop_supply" value={supply.productId} />
            Tirar {supply.name} · {supply.qty}
          </label>
        ))}
        <div className="split">
          <label>
            Produto
            <select name="new_supply" defaultValue="">
              <option value="">Não incluir</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Quantidade
            <input name="new_supply_qty" type="number" min={1} />
          </label>
        </div>
        <SubmitButton label="Salvar serviço" />
      </form>
    </Panel>
  );
}
