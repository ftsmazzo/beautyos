import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDesk } from "@/catalog/access";
import { centsToInput, formatDay, formatPhone, formatReais, packageDeadline } from "@/catalog/format";
import { birthdaysOn, houseRules, listCardAcquirers } from "@/catalog/queries";
import {
  addConsumption,
  applyClientCredit,
  addProduct,
  addServiceToOrder,
  adjustLinePrice,
  adjustLineCommission,
  applyPackageUse,
  chargePackageDifference,
  moveLineProfessional,
  pardonPackage,
  deleteEmptyOrder,
  removeLine,
  addVisitNote,
  deleteVisitNote,
  attachClient,
  changeClient,
  closeOrder,
  openDuePackageVisits,
  reopenOrder,
  removePayment,
  sellPackage,
  setStatus,
  toggleCourtesy,
  toggleFromOutside,
} from "@/desk/actions";
import { clientLedger, clientOptions, clientOtherDues, clientPackages, consumptionProducts, dayRoster, getOrder, linkedProfessional, orderTrail, packageServiceIds, packageVisits, packagesForSale, productOptions, serviceOptions, visitNotes } from "@/desk/queries";
import { listBanks } from "@/finance/queries";
import { APPOINTMENT_STATUS, PAYMENT_METHODS } from "@/desk/statuses";

function lineMoney(
  line: { kind: string; commissionCents: number; abatementCents: number; feeShareCents: number; referralCents: number },
  orderKind: string,
) {
  const rest = Math.max(0, line.abatementCents - line.feeShareCents);
  const bits = [
    line.commissionCents > 0 ? formatReais(line.commissionCents) : "",
    line.feeShareCents > 0 ? `taxa ${formatReais(line.feeShareCents)}` : "",
    rest > 0 && orderKind === "consumo" && line.kind === "servico" ? `sai de quem recebeu ${formatReais(rest)}` : "",
    rest > 0 && orderKind === "consumo" && line.kind === "produto" ? `consumo ${formatReais(rest)}` : "",
    rest > 0 && !(orderKind === "consumo" && (line.kind === "servico" || line.kind === "produto")) ? `abate ${formatReais(rest)}` : "",
    line.referralCents > 0 ? `indicação ${formatReais(line.referralCents)}` : "",
  ].filter(Boolean);
  return bits.join(" · ") || "—";
}
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { OrderServiceForm } from "@/ui/order-service-form";
import { StaffServiceForm } from "@/ui/staff-service-form";
import { PackageVisitForm } from "@/ui/package-visit-form";
import { ChannelForm } from "@/ui/channel-form";
import { PaymentForm } from "@/ui/payment-form";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const user = await requireDesk();
  const { id } = await params;
  const query = await searchParams;
  const order = await getOrder(user.accountId, id);
  if (!order) redirect("/comandas");
  await openDuePackageVisits(user.accountId, user.id, order.day);
  const own = user.role === "profissional" ? await linkedProfessional(user.id) : null;
  const involved = !own || order.professionalId === own || order.lines.some((line) => line.professionalId === own);
  if (!involved) redirect("/comandas");
  const operator = user.role === "administrador" || user.role === "balcao";
  const open = order.status === "aberta";
  const canClose =
    operator || (order.kind === "consumo" && own != null && order.professionalId === own);
  const total = order.lines.reduce((sum, line) => sum + line.priceCents, 0);
  const paid = order.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const people =
    order.incomplete || (operator && open && order.kind === "cliente" && order.clientId)
      ? await clientOptions(user.accountId)
      : [];
  const products = order.kind === "cliente" && open ? await productOptions(user.accountId) : [];
  const banks = operator && open && order.kind === "cliente" ? await listBanks(user.accountId) : [];
  const acquirers =
    operator && open && order.kind === "cliente"
      ? (await listCardAcquirers(user.accountId))
          .filter((machine) => machine.active)
          .map((machine) => ({ ...machine, brands: machine.brands.filter((brand) => brand.active) }))
      : [];
  const ledger =
    operator && open && order.kind === "cliente" && order.clientId
      ? await clientLedger(user.accountId, order.clientId)
      : null;
  const credit = ledger?.creditCents ?? 0;
  const otherDues =
    order.kind === "cliente" && order.clientId
      ? await clientOtherDues(user.accountId, order.clientId, order.id)
      : [];
  const trail = await orderTrail(user.accountId, order.id);
  const gap = Math.max(0, total - paid);
  const roster = order.kind === "cliente" || order.kind === "consumo" ? await dayRoster(user.accountId, null) : [];
  const catalog = order.kind === "cliente" || order.kind === "consumo" ? await serviceOptions(user.accountId) : [];
  const stock = order.kind === "consumo" && open ? await consumptionProducts(user.accountId) : [];
  const held = order.kind === "cliente" && order.clientId ? await clientPackages(user.accountId, order.clientId, order.day) : [];
  const visits = order.kind === "cliente" && order.clientId ? await packageVisits(user.accountId, order.clientId) : [];
  const forSale = operator && open && order.kind === "cliente" && order.clientId ? await packagesForSale(user.accountId) : [];
  const covered = new Set(
    operator && open && order.kind === "cliente" && order.clientId
      ? await packageServiceIds(user.accountId, order.clientId, order.day)
      : [],
  );
  const statuses = Object.entries(APPOINTMENT_STATUS).filter(([value]) => value !== "bloqueado");
  const notes = await visitNotes(user.accountId, order.id);
  const openVisits = visits.filter((visit) => visit.status !== "usado" || visit.late);
  const askChannel = operator && open && order.kind === "cliente" && order.clientId != null && order.channel === "nao_informado";
  const rules = askChannel ? await houseRules(user.accountId) : null;
  const birthdays = await birthdaysOn(user.accountId, order.day);
  const birthday =
    (order.clientId != null && birthdays.clients.some((person) => person.id === order.clientId)) ||
    (order.kind === "consumo" && order.professionalId != null && birthdays.professionals.some((person) => person.id === order.professionalId));

  const heroName =
    order.kind === "consumo" ? order.professionalName ?? "Profissional" : order.clientName ?? "Sem nome";

  return (
    <Panel user={user} current="/comandas" title={order.kind === "consumo" ? "Consumo" : "Comanda"}>
      <div className="order-desk">
      <div className="desk-bar">
        <Link className="btn btn-outline" href={`/comandas?dia=${order.day}`}>
          ← Comandas
        </Link>
        <Link className="btn btn-outline" href={`/agenda?dia=${order.day}`}>
          Agenda
        </Link>
        <span className="day-label">{heroName}</span>
        {order.phone ? <span className="badge bg-secondary-lt">{formatPhone(order.phone)}</span> : null}
        <span className="badge bg-secondary-lt">{formatDay(order.day)}</span>
        <span className={`chip ${open ? "ok" : ""}`}>{open ? "Aberta" : "Fechada"}</span>
        <span className="badge bg-secondary-lt">Total {formatReais(total)}</span>
        {paid > 0 ? <span className="badge bg-secondary-lt">Pago {formatReais(paid)}</span> : null}
        <span className={`chip ${paid >= total ? "ok" : "hot"}`}>
          {paid >= total ? "Coberta" : `A receber ${formatReais(gap)}`}
        </span>
        {order.fromOutside ? <span className="badge bg-orange-lt text-orange">De fora</span> : null}
        {order.incomplete ? <span className="badge bg-red-lt text-red">Cadastro pendente</span> : null}
        {birthday ? <span className="badge bg-orange-lt text-orange">Aniversário</span> : null}
        {order.kind === "consumo" ? <span className="badge bg-secondary-lt">Consumo</span> : null}
        {otherDues.map((row) => (
          <Link key={row.id} className="badge bg-red-lt text-red" href={`/comandas/${row.id}`}>
            {formatDay(row.day)} {formatReais(row.gapCents)}
          </Link>
        ))}
        {operator && order.incomplete && open ? (
          <Modal label="Completar cadastro" title="Completar cadastro" tone="amber">
            <form action={attachClient}>
              <input type="hidden" name="order" value={order.id} />
              <label>
                Cliente já cadastrado
                <select name="client" defaultValue="">
                  <option value="">Cadastrar agora</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="split">
                <label>
                  Nome
                  <input name="name" />
                </label>
                <label>
                  Celular
                  <input name="phone" inputMode="numeric" />
                </label>
              </div>
              <label className="check">
                <input type="checkbox" name="from_outside" value="1" />
                De fora
              </label>
              <SubmitButton label="Completar" pendingLabel="Salvando…" />
            </form>
          </Modal>
        ) : null}
        {operator && order.clientId ? (
          <form action={toggleFromOutside}>
            <input type="hidden" name="order" value={order.id} />
            <input type="hidden" name="client" value={order.clientId} />
            <SubmitButton
              label={order.fromOutside ? "Tirar de fora" : "Marcar de fora"}
              pendingLabel="Salvando…"
              className="amber"
            />
          </form>
        ) : null}
        {operator && open && order.kind === "cliente" && order.clientId && !order.incomplete ? (
          <Modal label="Trocar cliente" title="Trocar cliente" tone="navy">
            <form action={changeClient}>
              <input type="hidden" name="order" value={order.id} />
              <label>
                Cliente
                <select name="client" required defaultValue="">
                  <option value="">Escolha</option>
                  {people
                    .filter((person) => person.id !== order.clientId)
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name}
                      </option>
                    ))}
                </select>
              </label>
              <SubmitButton label="Trocar" pendingLabel="Trocando…" />
            </form>
          </Modal>
        ) : null}
        {askChannel && rules && order.clientId ? (
          <Modal label="Como chegou" title="Como chegou" tone="navy">
            <ChannelForm
              orderId={order.id}
              clientId={order.clientId}
              housePercent={rules.referral}
              professionals={roster.map((person) => ({ id: person.id, name: person.nickname || person.name }))}
              clients={people.map((person) => ({ id: person.id, name: person.name }))}
            />
          </Modal>
        ) : null}
        {canClose ? (
          <form action={open ? closeOrder : reopenOrder} style={{ margin: 0 }}>
            <input type="hidden" name="order" value={order.id} />
            <SubmitButton
              label={open ? "Fechar" : "Reabrir"}
              pendingLabel={open ? "Fechando…" : "Reabrindo…"}
              className={open ? undefined : "quiet"}
            />
          </form>
        ) : null}
      </div>
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />

      <div className="order-section">
        <div className="order-actions-bar">
          <h2 style={{ margin: 0, border: 0, padding: 0, flex: "1 1 auto" }}>Itens</h2>
          {open && order.kind === "cliente" && catalog.length > 0 ? (
            <Modal label="Serviço" title="Serviço na comanda" tone="blue">
              <OrderServiceForm
                orderId={order.id}
                professionals={roster.filter((person) => person.bookable).map((person) => ({ id: person.id, name: person.nickname || person.name }))}
                services={[...catalog.reduce((map, row) => {
                  const current = map.get(row.id) ?? { id: row.id, name: row.name, professionalIds: [] as string[] };
                  current.professionalIds.push(row.professionalId);
                  map.set(row.id, current);
                  return map;
                }, new Map<string, { id: string; name: string; professionalIds: string[] }>()).values()]}
              />
            </Modal>
          ) : null}
          {open && order.kind === "cliente" && products.length > 0 ? (
            <Modal label="Produto" title="Produto na comanda" tone="teal">
              <form action={addProduct}>
                <input type="hidden" name="order" value={order.id} />
                <label>
                  Código de barras
                  <input name="barcode" autoComplete="off" />
                </label>
                <label>
                  Produto
                  <select name="product" defaultValue="">
                    <option value="">Pelo código</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} · {formatReais(product.priceCents)}
                        {product.barcode ? ` · ${product.barcode}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantidade
                  <input name="qty" type="number" min={1} defaultValue={1} required />
                </label>
                <label>
                  Quem vendeu
                  <select name="professional" defaultValue="">
                    <option value="">Sem profissional</option>
                    {roster.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.nickname || person.name}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton label="Lançar" pendingLabel="Lançando…" className="teal" />
              </form>
            </Modal>
          ) : null}
          {open && order.kind === "consumo" && stock.length > 0 ? (
            <Modal label="Produto consumido" title="Consumo interno" tone="teal">
              <form action={addConsumption}>
                <input type="hidden" name="order" value={order.id} />
                <label>
                  Produto
                  <select name="product" required defaultValue={stock[0]?.id}>
                    {stock.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </label>
                <SubmitButton label="Lançar consumo" pendingLabel="Lançando…" className="teal" />
              </form>
            </Modal>
          ) : null}
          {open && order.kind === "consumo" && roster.some((person) => person.id !== order.professionalId) ? (
            <Modal label="Serviço recebido" title="Serviço entre profissionais" tone="blue">
              <StaffServiceForm
                orderId={order.id}
                professionals={roster
                  .filter((person) => person.id !== order.professionalId)
                  .map((person) => ({ id: person.id, name: person.nickname || person.name }))}
                services={[...catalog.reduce((map, row) => {
                  const current = map.get(row.id) ?? { id: row.id, name: row.name, professionalIds: [] as string[] };
                  current.professionalIds.push(row.professionalId);
                  map.set(row.id, current);
                  return map;
                }, new Map<string, { id: string; name: string; professionalIds: string[] }>()).values()]}
              />
            </Modal>
          ) : null}
        </div>
        {order.lines.length === 0 ? <p className="queue-empty">Nenhuma linha ainda.</p> : null}
        {open && order.lines.length === 0 && order.payments.length === 0 ? (
          <form action={deleteEmptyOrder}>
            <input type="hidden" name="order" value={order.id} />
            <input type="hidden" name="back" value={`/comandas/${order.id}`} />
            <SubmitButton label="Excluir comanda" pendingLabel="Excluindo…" className="btn btn-outline" />
          </form>
        ) : null}
        {order.lines.length > 0 ? (
          <>
          <table className="sheet">
            <thead>
              <tr>
                <th>Item</th>
                <th>Profissional</th>
                <th>Horário</th>
                <th>Valor</th>
                <th>Comissão</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {order.lines.map((line) => (
                <tr key={line.id}>
                  <td data-label="Item">
                    {line.description}
                    {line.qty > 1 ? ` × ${line.qty}` : ""}
                    {line.courtesy ? " · cortesia" : ""}
                    {line.encaixe ? " · encaixe" : ""}
                    {line.packageCreditId ? " · pacote" : ""}
                    {notes
                      .filter((note) => note.appointmentId === line.appointmentId)
                      .map((note) => (
                        <div className="bos-row" key={note.id}>
                          <span>
                            {note.body} · {note.who} · {note.at}
                          </span>
                          {operator ? (
                            <form action={deleteVisitNote}>
                              <input type="hidden" name="order" value={order.id} />
                              <input type="hidden" name="note" value={note.id} />
                              <SubmitButton label="Apagar" pendingLabel="Apagando…" className="btn btn-outline" />
                            </form>
                          ) : null}
                        </div>
                      ))}
                  </td>
                  <td data-label="Profissional">{line.professionalName ?? "—"}</td>
                  <td data-label="Horário">
                    {line.start && line.end ? `${line.start}–${line.end}` : "—"}
                    {line.waitMin == null ? "" : line.appointmentStatus === "chegou" ? ` · há ${line.waitMin} min` : ` · esperou ${line.waitMin} min`}
                  </td>
                  <td data-label="Valor">{formatReais(line.priceCents)}</td>
                  <td data-label="Comissão">
                    {lineMoney(line, order.kind)}
                  </td>
                  <td data-label="Ações">
                    <div className="line-actions">
                    {open && (line.appointmentId || line.kind === "servico" || (operator && order.kind === "cliente" && line.kind !== "pacote" && !line.packageCreditId) || (operator && line.packageCreditId && line.kind === "servico")) ? (
                      <Modal label="Ajustar" title={`Ajustar · ${line.description}`} tone="navy">
                        {operator && order.kind === "cliente" && line.kind !== "pacote" && !line.packageCreditId ? (
                          <form action={adjustLinePrice}>
                            <input type="hidden" name="order" value={order.id} />
                            <input type="hidden" name="line" value={line.id} />
                            <label>
                              Preço
                              <input name="amount" inputMode="decimal" defaultValue={centsToInput(line.priceCents)} required />
                            </label>
                            <SubmitButton label="Salvar preço" pendingLabel="Salvando…" />
                          </form>
                        ) : null}
                        {operator && line.packageCreditId && line.kind === "servico" ? (
                          <form action={adjustLineCommission}>
                            <input type="hidden" name="order" value={order.id} />
                            <input type="hidden" name="line" value={line.id} />
                            <label>
                              Comissão (%)
                              <input name="percent" inputMode="numeric" defaultValue={String(line.commissionPercent)} required />
                            </label>
                            <SubmitButton label="Salvar comissão" pendingLabel="Salvando…" />
                          </form>
                        ) : null}
                        {line.appointmentId && line.appointmentStatus ? (
                          <form action={setStatus}>
                            <input type="hidden" name="order" value={order.id} />
                            <input type="hidden" name="appointment" value={line.appointmentId} />
                            <label>
                              Estado
                              <select name="status" defaultValue={line.appointmentStatus}>
                                {statuses.map(([value, paint]) => (
                                  <option key={value} value={value}>
                                    {paint.word}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <SubmitButton label="Salvar estado" pendingLabel="Salvando…" />
                          </form>
                        ) : null}
                        {line.kind === "servico" && line.serviceId ? (
                          <form action={moveLineProfessional}>
                            <input type="hidden" name="order" value={order.id} />
                            <input type="hidden" name="line" value={line.id} />
                            <label>
                              Profissional
                              <select name="professional" defaultValue={line.professionalId ?? ""}>
                                {catalog
                                  .filter((service) => service.id === line.serviceId)
                                  .filter((service) => order.kind !== "consumo" || service.professionalId !== order.professionalId)
                                  .map((service) => (
                                    <option key={service.professionalId} value={service.professionalId}>
                                      {roster.find((person) => person.id === service.professionalId)?.name ?? "Profissional"}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <SubmitButton label="Trocar" pendingLabel="Trocando…" />
                          </form>
                        ) : null}
                      </Modal>
                    ) : null}
                    {open ? (
                      <form action={removeLine}>
                        <input type="hidden" name="order" value={order.id} />
                        <input type="hidden" name="line" value={line.id} />
                        <SubmitButton label="Excluir" pendingLabel="Excluindo…" className="btn btn-outline" />
                      </form>
                    ) : null}
                    {operator && open && line.kind === "servico" && line.serviceId && !line.packageCreditId && covered.has(line.serviceId) ? (
                      <form action={applyPackageUse}>
                        <input type="hidden" name="order" value={order.id} />
                        <input type="hidden" name="line" value={line.id} />
                        <SubmitButton label="Abater" pendingLabel="Abatendo…" className="btn btn-outline" />
                      </form>
                    ) : null}
                    {operator && open && order.kind === "cliente" && line.kind !== "pacote" && !line.packageCreditId ? (
                      <form action={toggleCourtesy}>
                        <input type="hidden" name="order" value={order.id} />
                        <input type="hidden" name="line" value={line.id} />
                        <SubmitButton
                          label={line.courtesy ? "Cobrar" : "Cortesia"}
                          pendingLabel="Salvando…"
                          className="btn btn-outline"
                        />
                      </form>
                    ) : null}
                    {line.appointmentId ? (
                      <Modal label="Avaliação" title={`Avaliação · ${line.description}`} tone="navy">
                        <form action={addVisitNote}>
                          <input type="hidden" name="order" value={order.id} />
                          <input type="hidden" name="appointment" value={line.appointmentId} />
                          <label>
                            Texto
                            <textarea name="body" required minLength={2} maxLength={400} />
                          </label>
                          <SubmitButton label="Registrar" pendingLabel="Registrando…" />
                        </form>
                      </Modal>
                    ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        ) : null}
      </div>

      {order.kind === "cliente" && order.clientId && (held.length > 0 || forSale.length > 0 || openVisits.length > 0) ? (
        <div className="order-section">
          <div className="order-actions-bar">
            <h2 style={{ margin: 0, border: 0, padding: 0, flex: "1 1 auto" }}>Pacote</h2>
            {operator && visits.some((visit) => visit.status === "falta_agendar") ? (
              <Modal label="Marcar visita" title="Marcar visita do pacote" tone="blue">
                <PackageVisitForm
                  orderId={order.id}
                  credits={visits.filter((visit) => visit.status === "falta_agendar").map((visit, index, list) => {
                    const same = list.filter((item) => item.serviceId === visit.serviceId);
                    const place = same.findIndex((item) => item.id === visit.id) + 1;
                    return {
                      id: visit.id,
                      serviceId: visit.serviceId,
                      serviceName: visit.serviceName,
                      label: same.length > 1 ? `${visit.serviceName} · ${place}` : visit.serviceName,
                    };
                  })}
                  people={roster.map((person) => ({
                    id: person.id,
                    name: person.nickname || person.name,
                    serviceIds: catalog.filter((service) => service.professionalId === person.id).map((service) => service.id),
                  }))}
                />
              </Modal>
            ) : null}
            {forSale.length > 0 ? (
              <Modal label="Vender pacote" title="Vender pacote" tone="blue">
                <form action={sellPackage}>
                  <input type="hidden" name="order" value={order.id} />
                  <label>
                    Pacote
                    <select name="package" required defaultValue={forSale[0]?.id}>
                      {forSale.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {formatReais(item.priceCents)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Quem vendeu
                    <select name="seller" defaultValue="">
                      <option value="">Sem comissão de venda</option>
                      {roster.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.nickname || person.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SubmitButton label="Vender" pendingLabel="Vendendo…" />
                </form>
              </Modal>
            ) : null}
          </div>
          {held.length > 0 ? (
            <table className="sheet">
              <thead>
                <tr>
                  <th>Pacote</th>
                  <th>Uso</th>
                  <th>Prazo</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {held.map((item) => {
                  const warned = item.expired || item.late;
                  return (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      <td>{item.used} de {item.total}</td>
                      <td>
                        {packageDeadline(item)}
                        {warned ? (item.pardons > 0 ? ` · ${item.pardons + 1}ª` : " · vencido") : ""}
                      </td>
                      <td>
                        {operator && warned ? (
                          <form action={pardonPackage}>
                            <input type="hidden" name="order" value={order.id} />
                            <input type="hidden" name="package" value={item.id} />
                            <SubmitButton label="Perdoar" pendingLabel="Perdoando…" className="btn btn-outline" />
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
          {openVisits.length > 0 ? (
            <table className="sheet">
              <thead>
                <tr>
                  <th>Visita</th>
                  <th>Quando</th>
                  <th>Profissional</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {openVisits.map((visit) => {
                  const due = visit.late && visit.listPriceCents != null
                    ? Math.max(0, visit.listPriceCents - visit.internalPriceCents)
                    : null;
                  return (
                    <tr key={visit.id}>
                      <td>{visit.serviceName}</td>
                      <td>
                        {visit.status === "usado" ? "Usada" : visit.when ?? "Falta agendar"}
                        {visit.late ? " · depois do prazo" : ""}
                        {due != null ? ` · ${formatReais(due)}` : ""}
                      </td>
                      <td>{visit.professionalName && visit.status !== "falta_agendar" ? visit.professionalName : "—"}</td>
                      <td>
                        {operator && visit.late ? (
                          <form action={chargePackageDifference}>
                            <input type="hidden" name="order" value={order.id} />
                            <input type="hidden" name="credit" value={visit.id} />
                            <SubmitButton
                              label={due != null ? `Cobrar ${formatReais(due)}` : "Cobrar diferença"}
                              pendingLabel="Cobrando…"
                              className="btn btn-outline"
                            />
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}

      {order.kind === "cliente" ? (
        <div className="order-section">
          <div className="order-actions-bar">
            <h2 style={{ margin: 0, border: 0, padding: 0, flex: "1 1 auto" }}>Pagamentos</h2>
            <div className="order-due-summary">
              <span>
                Total <strong>{formatReais(total)}</strong>
              </span>
              {paid > 0 ? (
                <span>
                  Pago <strong>{formatReais(paid)}</strong>
                </span>
              ) : null}
              <span className={gap > 0 ? "due" : "ok"}>
                {gap > 0 ? "A receber" : "Coberta"} <strong>{formatReais(gap)}</strong>
              </span>
            </div>
            {operator && open ? (
              <Modal label="Receber" title="Receber pagamento" tone="teal">
                <PaymentForm
                  orderId={order.id}
                  banks={banks.map((bank) => ({ id: bank.id, name: bank.name }))}
                  acquirers={acquirers}
                  totalCents={total}
                  paidCents={paid}
                  dueCents={gap}
                />
              </Modal>
            ) : null}
            {operator && open && order.clientId && credit > 0 && gap > 0 ? (
              <Modal label={`Crédito ${formatReais(credit)}`} title="Usar crédito" tone="navy">
                <form action={applyClientCredit}>
                  <input type="hidden" name="order" value={order.id} />
                  <span className="badge bg-secondary-lt">
                    {formatReais(credit)}
                    {ledger && ledger.sources.length > 0
                      ? ` · ${ledger.sources.map((row) => `${formatDay(row.day)} ${formatReais(row.cents)}`).join(", ")}`
                      : ""}
                  </span>
                  <label>
                    Valor
                    <input
                      name="amount"
                      inputMode="decimal"
                      defaultValue={centsToInput(Math.min(credit, gap))}
                      required
                    />
                  </label>
                  <SubmitButton label="Usar crédito" pendingLabel="Usando…" />
                </form>
              </Modal>
            ) : null}
          </div>
          {order.payments.length > 0 ? (
            <table className="sheet">
              <thead>
                <tr>
                  <th>Forma</th>
                  <th>Valor</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {order.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td data-label="Forma">
                      {payment.method === "conta"
                        ? "Conta do cliente"
                        : PAYMENT_METHODS.find((method) => method.value === payment.method)?.label ?? payment.method}
                      {payment.acquirerName ? ` · ${payment.acquirerName}` : ""}
                      {payment.brandName ? ` · ${payment.brandName}` : ""}
                      {payment.bankName ? ` · ${payment.bankName}` : ""}
                    </td>
                    <td data-label="Valor">
                      {formatReais(payment.amountCents)}
                      {payment.feeCents > 0 ? ` · taxa da máquina ${formatReais(payment.feeCents)}` : ""}
                    </td>
                    <td data-label="Ações">
                      {operator && open ? (
                        <form action={removePayment}>
                          <input type="hidden" name="order" value={order.id} />
                          <input type="hidden" name="payment" value={payment.id} />
                          <SubmitButton label="Remover" pendingLabel="Removendo…" className="btn btn-outline" />
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : (
        <span className="badge bg-secondary-lt">Consumo interno</span>
      )}

      {trail.length > 0 ? (
        <details className="desk-secondary">
          <summary>Histórico ({trail.length})</summary>
          <div className="queue" style={{ marginTop: 8 }}>
            {trail.map((row) => (
              <div className="queue-row" key={row.id}>
                <span>{row.at}</span>
                <strong>
                  {row.kind === "valor"
                    ? "Valor"
                    : row.kind === "cliente"
                      ? "Cliente"
                      : row.kind === "reabertura"
                        ? "Reabertura"
                        : "Cancelamento"}
                </strong>
                {row.actorName ? <span>{row.actorName}</span> : null}
                <span>{row.summary}</span>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {canClose ? (
        <form className="desk-close" action={open ? closeOrder : reopenOrder}>
          <input type="hidden" name="order" value={order.id} />
          <SubmitButton
            label={open ? "Fechar" : "Reabrir"}
            pendingLabel={open ? "Fechando…" : "Reabrindo…"}
            className={open ? undefined : "quiet"}
          />
        </form>
      ) : null}
      <div className="sale-bar">
        <div>
          {order.kind === "consumo" ? (
            <>
              <strong>Consumo interno</strong>
              <span>{open ? "Fecha sem pagamento" : "Fechada"}</span>
            </>
          ) : (
            <>
              <strong>Total {formatReais(total)}</strong>
              <span>{paid >= total ? "Coberta" : `A receber ${formatReais(total - paid)}`}</span>
            </>
          )}
        </div>
        {canClose ? (
          <form action={open ? closeOrder : reopenOrder}>
            <input type="hidden" name="order" value={order.id} />
            <SubmitButton
              label={open ? "Fechar" : "Reabrir"}
              pendingLabel={open ? "Fechando…" : "Reabrindo…"}
              className={open ? undefined : "quiet"}
            />
          </form>
        ) : null}
      </div>
      </div>
    </Panel>
  );
}
