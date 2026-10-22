import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/session";
import { saveCardAcquirer, saveCardBrand, saveHouseRules, stopCardAcquirer, stopCardBrand } from "@/catalog/house-actions";
import {
  applyDuePrices,
  birthdaysAhead,
  catalogCounts,
  houseRules,
  listCardAcquirers,
  listPayables,
  listProfessionals,
  openPriceNotices,
  productsAtMinimum,
} from "@/catalog/queries";
import { formatDay, formatPhone, formatRate, formatReais, todaySaoPaulo } from "@/catalog/format";
import {
  clientsWithCredit,
  deskPulse,
  deskReceivables,
  extrasBook,
  latePackageVisits,
  linkedProfessional,
  openIncompleteOrders,
  overdueReturns,
  ownCommission,
  commissionBook,
  rankNet,
  rankStaff,
  unpaidPackageSales,
} from "@/desk/queries";
import { openConsumption } from "@/desk/actions";
import { shiftDay, weekBounds } from "@/desk/clock";
import { APPOINTMENT_STATUS } from "@/desk/statuses";
import { PriceNotice } from "@/ui/price-notice";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; erro?: string }>;
}) {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  const params = await searchParams;
  const operator = user.role === "administrador" || user.role === "balcao";
  if (operator) await applyDuePrices(user.accountId);
  const notices = operator ? await openPriceNotices(user.accountId) : [];
  const counts = operator ? await catalogCounts(user.accountId) : null;
  const rules = operator || user.role === "administrador" ? await houseRules(user.accountId) : null;
  const acquirers = user.role === "administrador" ? await listCardAcquirers(user.accountId) : [];
  const today = todaySaoPaulo();
  const tomorrow = shiftDay(today, 1);
  const birthdays = user.role === "cliente" ? null : await birthdaysAhead(user.accountId, today);
  const lateVisits = operator ? await latePackageVisits(user.accountId) : [];
  const lateClients = operator ? await overdueReturns(user.accountId, today) : [];
  const own = user.role === "profissional" ? await linkedProfessional(user.id) : null;
  const mine = own ? await ownCommission(user.accountId, own, today) : null;
  const pulse =
    operator || own
      ? await deskPulse(user.accountId, today, operator ? null : own)
      : null;
  const receivables =
    operator || own
      ? await deskReceivables(user.accountId, operator ? null : own)
      : [];
  const lowStock = operator ? await productsAtMinimum(user.accountId) : [];
  const wallets = operator ? await clientsWithCredit(user.accountId) : [];
  const unpaidPackages = operator ? await unpaidPackageSales(user.accountId) : [];
  const duePayables =
    user.role === "administrador"
      ? (await listPayables(user.accountId))
          .filter((row) => !row.paid && row.dueIso <= shiftDay(today, 7))
          .slice(0, 12)
      : [];
  const nameless =
    operator || own
      ? await openIncompleteOrders(user.accountId, operator ? null : own)
      : [];
  const week = weekBounds(today);
  const ranking = operator
    ? rankStaff(
        await commissionBook(user.accountId, week.start, today, null),
        new Set((await listProfessionals(user.accountId)).map((person) => person.id)),
      )
    : [];
  const extras =
    operator && rules?.extrasLadder
      ? await extrasBook(user.accountId, week.start, today)
      : [];
  const dueOpen = pulse?.openOrders ?? [];
  const dueTotal = receivables.reduce((sum, row) => sum + row.gapCents, 0);

  const birthdayToday = birthdays?.filter((person) => person.day === today).length ?? 0;
  const birthdaySoon = birthdays?.length ?? 0;

  return (
    <Panel user={user} current="/inicio" title="Início">
      {params.ok === "regras" ? <p className="ok">Regras salvas.</p> : null}
      {params.erro === "dados" ? <p className="error">Informe os percentuais, de 0 a 100.</p> : null}
      {pulse ? (
        <div className="pulse-hero">
          <div className="pulse-stats">
            <h2>Hoje · {formatDay(today)}</h2>
            <span className="chip">{pulse.todaySlots.length} {pulse.todaySlots.length === 1 ? "horário" : "horários"}</span>
            {pulse.tomorrowQty > 0 ? <span className="chip">Amanhã {pulse.tomorrowQty}</span> : null}
            {dueOpen.length > 0 ? <span className="chip hot">{dueOpen.length} com falta</span> : null}
            {receivables.length > 0 ? <span className="chip warn">A receber {formatReais(dueTotal)}</span> : null}
            {birthdayToday > 0 ? (
              <Link className="chip warn" href="/aniversariantes">
                {birthdayToday} aniversário{birthdayToday === 1 ? "" : "s"} hoje
              </Link>
            ) : birthdaySoon > 0 ? (
              <Link className="chip" href="/aniversariantes">
                {birthdaySoon} aniversário{birthdaySoon === 1 ? "" : "s"} · 14 dias
              </Link>
            ) : null}
            <div className="pulse-link">
              <Link className="btn" href={`/agenda?dia=${today}`}>
                Agenda
              </Link>
              <Link className="btn quiet" href={`/comandas?dia=${today}`}>
                Comandas
              </Link>
              {operator ? (
                <Link className="btn quiet" href={`/agenda?dia=${tomorrow}`}>
                  Amanhã
                </Link>
              ) : null}
            </div>
          </div>
          {pulse.floor.length > 0 ? (
            <div className="desk-floor">
              <span className="label">Na casa</span>
              {pulse.floor.map((slot) => {
                const label = [
                  slot.status === "chegou" ? "Chegou" : "Em atendimento",
                  slot.time,
                  slot.clientName ?? "Sem nome",
                  slot.professionalName,
                  slot.waitMin != null
                    ? slot.status === "chegou"
                      ? `há ${slot.waitMin} min`
                      : `esperou ${slot.waitMin} min`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                return slot.orderId ? (
                  <Link key={slot.id} className="chip ok" href={`/comandas/${slot.orderId}`}>
                    {label}
                  </Link>
                ) : (
                  <span key={slot.id} className="chip ok">
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}
          {pulse.todaySlots.length === 0 ? <p className="queue-empty">Nenhum horário ainda hoje.</p> : null}
          {pulse.todaySlots.length > 0 ? (
            <div className="queue" style={{ marginBottom: 0 }}>
              {pulse.todaySlots.map((slot) => (
                <div className="queue-row" key={slot.id}>
                  <strong>{slot.time}</strong>
                  <span>{slot.clientName ?? "Sem nome"}</span>
                  <span>{slot.serviceName ?? "Horário"}</span>
                  <span className="chip">{APPOINTMENT_STATUS[slot.status as keyof typeof APPOINTMENT_STATUS]?.word ?? slot.status}</span>
                  {slot.orderId ? <Link href={`/comandas/${slot.orderId}`}>Comanda</Link> : null}
                </div>
              ))}
            </div>
          ) : null}
          {dueOpen.length > 0 ? (
            <div className="desk-floor">
              <span className="label">Falta hoje</span>
              {dueOpen.map((row) => (
                <Link key={row.id} className="chip hot" href={`/comandas/${row.id}`}>
                  {row.who} · {formatReais(row.gapCents)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {(operator || own) && nameless.length > 0 ? (
        <div className="queue">
          <div className="queue-head">
            <h2>Sem nome</h2>
            <Link className="meta" href="/comandas?lista=abertas&filtro=semnome">
              Abrir a fila
            </Link>
          </div>
          {nameless.map((row) => (
            <div className="queue-row" key={row.id}>
              <Link href={`/comandas/${row.id}`}>{formatDay(row.day)}</Link>
              <span>{formatReais(row.totalCents)}</span>
              {row.paidCents < row.totalCents ? <span className="chip hot">falta {formatReais(row.totalCents - row.paidCents)}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {(operator || own) && receivables.length > 0 ? (
        <div className="queue">
          <div className="queue-head">
            <h2>A receber · {formatReais(dueTotal)}</h2>
            <Link className="meta" href="/comandas?lista=abertas&filtro=falta">
              {receivables.length} comanda{receivables.length === 1 ? "" : "s"}
            </Link>
          </div>
          {receivables.slice(0, 12).map((row) => (
            <div className="queue-row" key={row.id}>
              <Link href={`/comandas/${row.id}`}>{row.who}</Link>
              {row.phone ? <span>{formatPhone(row.phone)}</span> : null}
              <span>{formatDay(row.day)}</span>
              <span className="chip warn">falta {formatReais(row.gapCents)}</span>
              {row.day < today ? <span className="chip hot">atrasada</span> : null}
              {row.day === today ? <span className="chip">hoje</span> : null}
            </div>
          ))}
          {receivables.length > 12 ? (
            <div className="queue-row">
              <Link href="/comandas?lista=abertas&filtro=falta">Ver as {receivables.length}</Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {user.role === "administrador" && duePayables.length > 0 ? (
        <div className="queue">
          <div className="queue-head">
            <h2>Contas a pagar</h2>
            <Link className="meta" href="/financeiro?filtro=atrasado">
              Financeiro
            </Link>
          </div>
          {duePayables.map((row) => (
            <div className="queue-row" key={row.id}>
              <span>{row.due}</span>
              <strong>{row.partyName}</strong>
              <span>{row.description}</span>
              <span>{formatReais(row.amountCents)}</span>
              {row.dueIso < today ? <span className="chip hot">atrasada</span> : null}
              {row.dueIso === today ? <span className="chip warn">hoje</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {operator && unpaidPackages.length > 0 ? (
        <div className="queue">
          <div className="queue-head">
            <h2>Pacote a receber</h2>
            <Link className="meta" href="/pacotes/vendidos?filtro=receber">
              Ver a fila
            </Link>
          </div>
          {unpaidPackages.slice(0, 12).map((row) => (
            <div className="queue-row" key={row.id}>
              <Link href={`/pacotes/vendidos/${row.id}`}>{row.clientName}</Link>
              {row.phone ? <span>{formatPhone(row.phone)}</span> : null}
              <span>{row.name}</span>
              <span className="chip warn">falta {formatReais(row.priceCents - row.paidCents)}</span>
              {row.orderId ? <Link href={`/comandas/${row.orderId}`}>Comanda</Link> : null}
            </div>
          ))}
        </div>
      ) : null}
      {operator && wallets.length > 0 ? (
        <div className="queue">
          <div className="queue-head">
            <h2>Crédito na conta</h2>
            <span className="meta">Usar na comanda aberta</span>
          </div>
          {wallets.map((person) => (
            <div className="queue-row" key={person.id}>
              <Link href={`/clientes/${person.id}`}>{person.name}</Link>
              {person.phone ? <span>{formatPhone(person.phone)}</span> : null}
              <span className="chip ok">{formatReais(person.creditCents)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {operator && counts ? (
        <>
          <PriceNotice notices={notices} back="inicio" />
          {lowStock.length > 0 ? (
            <div className="queue">
              <div className="queue-head">
                <h2>Estoque no mínimo</h2>
                <Link className="meta" href="/produtos?filtro=minimo">
                  Lista
                </Link>
              </div>
              {lowStock.slice(0, 10).map((product) => (
                <div className="queue-row" key={product.id}>
                  <Link href={`/produtos/${product.id}`}>{product.name}</Link>
                  <span>saldo {product.balance}</span>
                  <span>mín. {product.minQty}</span>
                  {product.supplierName ? <span>{product.supplierName}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          {lateVisits.length > 0 ? (
            <div className="queue">
              <div className="queue-head">
                <h2>Pacote fora do prazo</h2>
              </div>
              {lateVisits.map((visit) => (
                <div className="queue-row" key={visit.creditId}>
                  <Link href={`/pacotes/vendidos/${visit.packageId}`}>{visit.clientName}</Link>
                  <span>{visit.packageName}</span>
                  <span>ida {visit.when}</span>
                  <span>{visit.professional}</span>
                </div>
              ))}
            </div>
          ) : null}
          {lateClients.length > 0 ? (
            <div className="queue">
              <div className="queue-head">
                <h2>Passou da volta</h2>
                <Link className="meta" href="/volta">
                  Registro
                </Link>
              </div>
              {lateClients.map((person) => (
                <div className="queue-row" key={`${person.id}-${person.serviceId}`}>
                  <Link href={`/clientes/${person.id}`}>{person.name}</Link>
                  <span>{formatPhone(person.phone)}</span>
                  <span>{person.serviceName}</span>
                  <span className="chip warn">há {person.lateDays}d</span>
                  <Link href={`/agenda?cliente=${person.id}&servico=${person.serviceId}`}>Agendar</Link>
                </div>
              ))}
            </div>
          ) : null}
          {ranking.length > 0 ? (
            <div className="queue">
              <div className="queue-head">
                <h2>Ranking · {formatDay(week.start)}–hoje</h2>
                <Link className="meta" href={`/comissao?de=${week.start}&ate=${today}`}>
                  Comissão
                </Link>
              </div>
              {ranking.map((person, index) => (
                <div className="queue-row" key={person.id}>
                  <strong>#{index + 1}</strong>
                  <span>{person.name}</span>
                  <span>{person.visits} atend.</span>
                  <span>{formatReais(rankNet(person))}</span>
                </div>
              ))}
            </div>
          ) : null}
          {rules?.extrasLadder && extras.length > 0 ? (
            <div className="queue">
              <div className="queue-head">
                <h2>Meta de extras</h2>
              </div>
              {extras.map((person, index) => (
                <div className="queue-row" key={person.id}>
                  <strong>#{index + 1}</strong>
                  <span>{person.name}</span>
                  <span>{person.visits}</span>
                  <span>{formatReais(person.cents)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="tiles">
            <Link className="tile tile-blue" href="/agenda">
              <strong>Agenda</strong>
              <span>Grade do dia</span>
            </Link>
            <Link className="tile tile-teal" href="/comandas">
              <strong>Comandas</strong>
              <span>Do dia</span>
            </Link>
            <Link className="tile tile-amber" href="/caixa">
              <strong>Caixa</strong>
              <span>Do dia</span>
            </Link>
          </div>
          <div className="tiles">
            <Link className="tile tile-blue" href="/servicos">
              <strong>{counts.services}</strong>
              <span>Serviços</span>
            </Link>
            <Link className="tile tile-teal" href="/profissionais">
              <strong>{counts.professionals}</strong>
              <span>Profissionais</span>
            </Link>
            <Link className="tile tile-amber" href="/clientes">
              <strong>{counts.clients}</strong>
              <span>Clientes</span>
            </Link>
            <Link className="tile tile-rose" href="/produtos">
              <strong>{counts.products}</strong>
              <span>Produtos</span>
            </Link>
            <Link className="tile tile-violet" href="/pacotes">
              <strong>{counts.packages}</strong>
              <span>Pacotes</span>
            </Link>
          </div>
        </>
      ) : null}
      {user.role === "profissional" ? (
        <div className="desk-bar">
          <Link className="btn" href="/agenda">
            Agenda
          </Link>
          <Link className="btn quiet" href="/comandas">
            Comandas
          </Link>
          <Link className="btn quiet" href="/comissao">
            Comissão {formatReais(mine?.commissionCents ?? 0)}
          </Link>
          <span className="chip">Abate {formatReais(mine?.abatementCents ?? 0)}</span>
          {own && pulse?.consumption ? (
            <Link className="btn quiet" href={`/comandas/${pulse.consumption.id}`}>
              Consumo {pulse.consumption.status === "aberta" ? "aberto" : "fechado"}
            </Link>
          ) : null}
          {own && !pulse?.consumption ? (
            <form action={openConsumption}>
              <input type="hidden" name="day" value={today} />
              <input type="hidden" name="professional" value={own} />
              <SubmitButton label="Abrir consumo" pendingLabel="Abrindo…" className="teal" />
            </form>
          ) : null}
          {!own ? <span className="chip">Sem ficha</span> : null}
        </div>
      ) : null}
      {user.role === "cliente" ? (
        <div className="desk-bar">
          <Link className="btn" href="/meu">
            Minha conta
          </Link>
        </div>
      ) : null}
      {user.role === "administrador" && rules ? (
        <Modal label="Regras da casa" title="Regras da casa" tone="navy">
          <form action={saveHouseRules}>
            <label>
              Comissão de quem indicou (%)
              <input name="referral" type="number" min={0} max={100} required defaultValue={rules.referral} />
            </label>
            <label>
              Consumo do profissional (% do preço de venda)
              <input name="consumption" type="number" min={0} max={100} required defaultValue={rules.consumption} />
            </label>
            <label>
              Desconto do serviço entre profissionais (%)
              <input name="service_discount" type="number" min={0} max={100} required defaultValue={rules.serviceDiscount} />
            </label>
            <label className="check">
              <input type="checkbox" name="extras_ladder" value="1" defaultChecked={rules.extrasLadder} />
              Mostrar meta de extras
            </label>
            <SubmitButton label="Salvar regras" />
          </form>
          <h2>Máquinas de cartão</h2>
          {acquirers.filter((machine) => machine.active).map((machine) => (
            <div key={machine.id} className="stack">
            <form action={saveCardAcquirer}>
              <input type="hidden" name="id" value={machine.id} />
              <div className="split">
                <label>
                  Máquina
                  <input name="name" required defaultValue={machine.name} />
                </label>
                <label>
                  Débito base (%)
                  <input name="debit" required defaultValue={(machine.debitBps / 100).toFixed(2).replace(".", ",")} />
                </label>
                <label>
                  Crédito base (%)
                  <input name="credit" required defaultValue={(machine.creditBps / 100).toFixed(2).replace(".", ",")} />
                </label>
              </div>
              <div className="row">
                <SubmitButton label="Salvar máquina" pendingLabel="Salvando…" />
                <span className="chip">
                  base {formatRate(machine.debitBps)} / {formatRate(machine.creditBps)}
                </span>
              </div>
            </form>
            {machine.brands.filter((brand) => brand.active).map((brand) => (
              <form key={brand.id} action={saveCardBrand}>
                <input type="hidden" name="id" value={brand.id} />
                <input type="hidden" name="acquirer" value={machine.id} />
                <div className="split">
                  <label>
                    Bandeira
                    <input name="name" required defaultValue={brand.name} />
                  </label>
                  <label>
                    Débito (%)
                    <input name="debit" required defaultValue={(brand.debitBps / 100).toFixed(2).replace(".", ",")} />
                  </label>
                  <label>
                    Crédito (%)
                    <input name="credit" required defaultValue={(brand.creditBps / 100).toFixed(2).replace(".", ",")} />
                  </label>
                </div>
                <SubmitButton label="Salvar bandeira" pendingLabel="Salvando…" className="quiet" />
              </form>
            ))}
            <form action={saveCardBrand}>
              <input type="hidden" name="acquirer" value={machine.id} />
              <div className="split">
                <label>
                  Nova bandeira
                  <input name="name" required placeholder="Visa, Mastercard, Elo" />
                </label>
                <label>
                  Débito (%)
                  <input name="debit" required placeholder="1,19" />
                </label>
                <label>
                  Crédito (%)
                  <input name="credit" required placeholder="2,49" />
                </label>
              </div>
              <SubmitButton label={`Incluir em ${machine.name}`} pendingLabel="Salvando…" className="quiet" />
            </form>
            </div>
          ))}
          {acquirers
            .filter((machine) => machine.active)
            .map((machine) => (
              <div key={`off-${machine.id}`} className="row">
                <form action={stopCardAcquirer}>
                  <input type="hidden" name="id" value={machine.id} />
                  <SubmitButton label={`Desativar ${machine.name}`} pendingLabel="Desativando…" className="quiet" />
                </form>
                {machine.brands.filter((brand) => brand.active).map((brand) => (
                  <form key={`off-brand-${brand.id}`} action={stopCardBrand}>
                    <input type="hidden" name="id" value={brand.id} />
                    <SubmitButton label={`Desativar ${brand.name}`} pendingLabel="Desativando…" className="quiet" />
                  </form>
                ))}
              </div>
            ))}
          <form action={saveCardAcquirer}>
            <div className="split">
              <label>
                Nova máquina
                <input name="name" required placeholder="Rede, InfinityPay" />
              </label>
              <label>
                Débito (%)
                <input name="debit" required placeholder="0,99" />
              </label>
              <label>
                Crédito (%)
                <input name="credit" required placeholder="2,99" />
              </label>
            </div>
            <SubmitButton label="Incluir máquina" pendingLabel="Salvando…" />
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}
