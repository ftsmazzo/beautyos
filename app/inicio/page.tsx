import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth/session";
import { saveHouseRules } from "@/catalog/house-actions";
import { applyDuePrices, birthdaysAhead, catalogCounts, houseRules, listProfessionals, openPriceNotices } from "@/catalog/queries";
import { formatDay, formatPhone, formatReais, todaySaoPaulo } from "@/catalog/format";
import {
  deskPulse,
  latePackageVisits,
  linkedProfessional,
  overdueReturns,
  ownCommission,
  commissionBook,
  rankNet,
  rankStaff,
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
  const rules = user.role === "administrador" ? await houseRules(user.accountId) : null;
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
  const week = weekBounds(today);
  const ranking = operator
    ? rankStaff(
        await commissionBook(user.accountId, week.start, today, null),
        new Set((await listProfessionals(user.accountId)).map((person) => person.id)),
      )
    : [];
  const dueOpen = pulse?.openOrders.filter((row) => row.gapCents > 0) ?? [];

  return (
    <Panel user={user} current="/inicio" title="Início">
      {params.ok === "regras" ? <p className="ok">Regras salvas.</p> : null}
      {params.erro === "dados" ? <p className="error">Informe os percentuais, de 0 a 100.</p> : null}
      {birthdays ? (
        <div className="card">
          <h2>Aniversário</h2>
          <p>Os próximos 14 dias. Quem faz anos hoje também aparece na agenda.</p>
          {birthdays.length === 0 ? <p>Nenhum nestes dias.</p> : null}
          {birthdays.map((person) => (
            <p key={`${person.kind}-${person.id}-${person.day}`}>
              {person.day === today ? "Hoje" : formatDay(person.day)}
              {" · "}
              {person.kind === "cliente" ? "Cliente" : "Equipe"}
              {" · "}
              {operator ? (
                <Link href={person.kind === "cliente" ? `/clientes/${person.id}` : `/profissionais/${person.id}`}>{person.name}</Link>
              ) : (
                person.name
              )}
              {person.turning > 0 && person.turning < 120 ? ` · faz ${person.turning}` : ""}
              {person.phone ? ` · ${formatPhone(person.phone)}` : ""}
            </p>
          ))}
        </div>
      ) : null}
      {pulse ? (
        <div className="card">
          <h2>Dia</h2>
          <p>
            Hoje {formatDay(today)}. {pulse.todaySlots.length} {pulse.todaySlots.length === 1 ? "horário" : "horários"} na grade
            {pulse.tomorrowQty > 0 ? ` · amanhã ${pulse.tomorrowQty}` : ""}
            {dueOpen.length > 0 ? ` · ${dueOpen.length} comanda${dueOpen.length === 1 ? "" : "s"} com falta` : ""}
            {" · "}
            <Link href={`/agenda?dia=${today}`}>Agenda</Link>
            {" · "}
            <Link href={`/comandas?dia=${today}`}>Comandas</Link>
            {operator ? (
              <>
                {" · "}
                <Link href={`/agenda?dia=${tomorrow}`}>Amanhã</Link>
              </>
            ) : null}
          </p>
          {pulse.todaySlots.length === 0 ? <p>Nenhum horário ainda hoje.</p> : null}
          {pulse.todaySlots.map((slot) => (
            <p key={slot.id}>
              {slot.time} · {slot.clientName ?? "Sem nome"} · {slot.serviceName ?? "Horário"}
              {" · "}
              {APPOINTMENT_STATUS[slot.status as keyof typeof APPOINTMENT_STATUS]?.word ?? slot.status}
              {slot.orderId ? (
                <>
                  {" · "}
                  <Link href={`/comandas/${slot.orderId}`}>Comanda</Link>
                </>
              ) : null}
            </p>
          ))}
          {dueOpen.length > 0 ? <h2>Em aberto com falta</h2> : null}
          {dueOpen.map((row) => (
            <p key={row.id}>
              <Link href={`/comandas/${row.id}`}>{row.who}</Link>
              {` · ${formatDay(row.day)} · falta ${formatReais(row.gapCents)}`}
            </p>
          ))}
        </div>
      ) : null}
      {operator && counts ? (
        <>
          <PriceNotice notices={notices} back="inicio" />
          {lateVisits.length > 0 ? (
            <div className="card">
              <h2>Pacote fora do prazo</h2>
              {lateVisits.map((visit) => (
                <p key={visit.creditId}>
                  <Link href={`/pacotes/vendidos/${visit.packageId}`}>{visit.clientName}</Link>
                  {` · ${visit.packageName} · ida ${visit.when} · ${visit.professional}`}
                </p>
              ))}
            </div>
          ) : null}
          <div className="card">
            <h2>Passou da volta</h2>
            <p>
              Cada serviço conta a própria volta. Quem já deveria ter voltado e ainda não tem horário desse serviço. Cliente de fora e serviço coberto por pacote ativo ficam fora desta lista.{" "}
              <Link href="/volta">Registro da volta</Link>
            </p>
            {lateClients.length === 0 ? <p>Ninguém neste momento.</p> : null}
            {lateClients.map((person) => (
              <p key={`${person.id}-${person.serviceId}`}>
                <Link href={`/clientes/${person.id}`}>{person.name}</Link>
                {` · ${formatPhone(person.phone)} · ${person.serviceName} · volta ${person.due} · há ${person.lateDays} ${person.lateDays === 1 ? "dia" : "dias"} · `}
                <Link href={`/agenda?cliente=${person.id}&servico=${person.serviceId}`}>Agendar</Link>
              </p>
            ))}
          </div>
          <div className="card">
            <h2>Ranking da semana</h2>
            <p>
              {formatDay(week.start)} até hoje. A ordem é o líquido.{" "}
              <Link href={`/comissao?de=${week.start}&ate=${today}`}>Abrir o período</Link>
            </p>
            {ranking.length === 0 ? <p>Nenhuma linha nesta semana.</p> : null}
            {ranking.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Pessoa</th>
                    <th>Atendimentos</th>
                    <th>Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((person, index) => (
                    <tr key={person.id}>
                      <td>{index + 1}</td>
                      <td>{person.name}</td>
                      <td>{person.visits}</td>
                      <td>{formatReais(rankNet(person))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
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
        <div className="card">
          <h2>Seu dia</h2>
          {own ? (
            <>
              <p>
                Comissão de hoje {formatReais(mine?.commissionCents ?? 0)}. Abate {formatReais(mine?.abatementCents ?? 0)}.
                {" · "}
                <Link href="/comissao">Comissão</Link>
              </p>
              {pulse?.consumption ? (
                <p>
                  Consumo de hoje{" "}
                  <Link href={`/comandas/${pulse.consumption.id}`}>
                    {pulse.consumption.status === "aberta" ? "aberto" : "fechado"}
                  </Link>
                  . Fecha sem pagamento e o abate entra na comissão.
                </p>
              ) : (
                <form action={openConsumption}>
                  <input type="hidden" name="day" value={today} />
                  <input type="hidden" name="professional" value={own} />
                  <p>Produto e serviço entre profissionais entram na comanda de consumo do dia.</p>
                  <SubmitButton label="Abrir consumo de hoje" pendingLabel="Abrindo…" className="teal" />
                </form>
              )}
            </>
          ) : (
            <p>Este acesso ainda não está ligado a um profissional.</p>
          )}
          <div className="row">
            <Link className="btn" href="/agenda">
              Abrir agenda
            </Link>
            <Link className="btn quiet" href="/comandas">
              Comandas
            </Link>
          </div>
        </div>
      ) : null}
      {user.role === "cliente" ? (
        <div className="card">
          <p>O histórico do cliente entra no acesso dele.</p>
        </div>
      ) : null}
      {rules ? (
        <Modal label="Regras da casa" title="Regras da casa" tone="navy">
          <form action={saveHouseRules}>
            <label>
              Comissão de quem indicou (%)
              <input name="referral" type="number" min={0} max={100} required defaultValue={rules.referral} />
            </label>
            <p>Vale por cima de quem executou. Cada cliente pode ter um número diferente.</p>
            <label>
              Consumo do profissional (% do preço de venda)
              <input name="consumption" type="number" min={0} max={100} required defaultValue={rules.consumption} />
            </label>
            <p>O preço de consumo de cada produto segue este percentual, até alguém gravar um valor próprio.</p>
            <label>
              Desconto do serviço entre profissionais (%)
              <input name="service_discount" type="number" min={0} max={100} required defaultValue={rules.serviceDiscount} />
            </label>
            <p>Zero não desconta. O valor da ficha, já com esse desconto, vira a comissão de quem executou e o abate de quem recebeu. Não entra na agenda nem no caixa.</p>
            <label>
              Taxa do débito (%)
              <input name="debit" type="number" min={0} max={100} required defaultValue={rules.debit} />
            </label>
            <label>
              Taxa do crédito (%)
              <input name="credit" type="number" min={0} max={100} required defaultValue={rules.credit} />
            </label>
            <p>Zero não cobra. A taxa entra no caixa, separada. Metade fica com a casa e metade sai da comissão de quem executou o que foi pago no cartão.</p>
            <SubmitButton label="Salvar regras" />
          </form>
        </Modal>
      ) : null}
    </Panel>
  );
}
