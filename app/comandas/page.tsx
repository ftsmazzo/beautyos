import Link from "next/link";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatPhone, formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds, shiftDay } from "@/desk/clock";
import { deleteEmptyOrder, openDayOrder, openDuePackageVisits } from "@/desk/actions";
import { clientOptions, dayOrders, linkedProfessional, listedOrders } from "@/desk/queries";
import { ErrorNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const SPAN = 92;

const OPEN_NOW = [
  { id: "falta", label: "Com falta" },
  { id: "atrasada", label: "Atrasadas" },
  { id: "hoje", label: "Hoje" },
  { id: "semnome", label: "Sem nome" },
  { id: "vazia", label: "Vazias" },
] as const;

const OPEN_MORE = [
  { id: "todas", label: "Todas" },
  { id: "vencer", label: "A vencer" },
  { id: "credito", label: "Com crédito" },
] as const;

const OPEN_FILTERS = [...OPEN_NOW, ...OPEN_MORE] as const;

type OpenFilter = (typeof OPEN_FILTERS)[number]["id"];

type OrderRow = {
  id: string;
  day?: string;
  clientName: string | null;
  phone: string | null;
  kind: string;
  status: string;
  incomplete: boolean;
  professionalName: string | null;
  totalCents: number;
  paidCents: number;
  lineCount: number;
  packageNote: string | null;
};

function isOpenFilter(value: string | undefined): value is OpenFilter {
  return OPEN_FILTERS.some((item) => item.id === value);
}

function who(order: OrderRow) {
  return order.kind === "consumo" ? `Consumo · ${order.professionalName ?? "profissional"}` : order.clientName ?? "Sem nome";
}

function gapOf(order: OrderRow) {
  return order.totalCents - order.paidCents;
}

function isEmpty(order: OrderRow) {
  return order.lineCount === 0 && order.paidCents === 0;
}

function openSituation(order: OrderRow, today: string) {
  if (order.incomplete) return "sem nome";
  if (isEmpty(order)) return "vazia";
  const gap = gapOf(order);
  if (gap < 0) return "crédito";
  if (gap === 0) return "em dia";
  if (!order.day) return "com falta";
  if (order.day < today) return "atrasada";
  if (order.day === today) return "hoje";
  return "a vencer";
}

function matchesOpen(order: OrderRow, filter: OpenFilter, today: string) {
  const gap = gapOf(order);
  if (filter === "todas") return true;
  if (filter === "semnome") return order.incomplete;
  if (filter === "vazia") return isEmpty(order);
  if (filter === "falta") return gap > 0;
  if (filter === "credito") return gap < 0;
  if (filter === "atrasada") return gap > 0 && !!order.day && order.day < today;
  if (filter === "hoje") return gap > 0 && order.day === today;
  if (filter === "vencer") return gap > 0 && !!order.day && order.day > today;
  return true;
}

function OrdersTable({
  orders,
  showDay,
  showSituation,
  today,
  canClearEmpty,
  emptyBack,
}: {
  orders: OrderRow[];
  showDay: boolean;
  showSituation?: boolean;
  today?: string;
  canClearEmpty?: boolean;
  emptyBack?: string;
}) {
  if (orders.length === 0) return null;
  return (
    <table className="sheet">
      <thead>
        <tr>
          {showDay ? <th>Dia</th> : null}
          <th>Quem</th>
          <th>Tipo</th>
          <th>Estado</th>
          {showSituation ? <th>Situação</th> : null}
          <th>Total</th>
          <th>Pago</th>
          <th>Falta</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {orders.map((order) => {
          const gap = gapOf(order);
          const empty = isEmpty(order);
          return (
            <tr key={order.id}>
              {showDay && order.day ? <td data-label="Dia">{formatDay(order.day)}</td> : null}
              <td data-label="Quem">
                <strong>{who(order)}</strong>
                {order.phone ? <div>{formatPhone(order.phone)}</div> : null}
                {order.kind === "cliente" && order.professionalName ? <div>{order.professionalName}</div> : null}
                {order.packageNote ? <div>{order.packageNote}</div> : null}
                {order.incomplete ? <div>Cadastro pendente</div> : null}
                {empty && !showSituation ? <div>Vazia</div> : null}
              </td>
              <td data-label="Tipo">{order.kind === "consumo" ? "Consumo" : "Cliente"}</td>
              <td data-label="Estado">{order.status === "fechada" ? "Fechada" : "Aberta"}</td>
              {showSituation && today ? <td data-label="Situação">{openSituation(order, today)}</td> : null}
              <td data-label="Total">{formatReais(order.totalCents)}</td>
              <td data-label="Pago">{formatReais(order.paidCents)}</td>
              <td data-label="Falta">{gap > 0 ? formatReais(gap) : gap < 0 ? `crédito ${formatReais(-gap)}` : "—"}</td>
              <td data-label="Ações">
                <Link href={`/comandas/${order.id}`}>Abrir</Link>
                {canClearEmpty && empty && emptyBack ? (
                  <form action={deleteEmptyOrder}>
                    <input type="hidden" name="order" value={order.id} />
                    <input type="hidden" name="back" value={emptyBack} />
                    <SubmitButton label="Excluir" pendingLabel="Excluindo…" className="quiet" />
                  </form>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string; erro?: string; lista?: string; de?: string; ate?: string; q?: string; filtro?: string }>;
}) {
  const user = await requireDesk();
  const query = await searchParams;
  const day = dayParam(query.dia);
  const lista = query.lista === "abertas" || query.lista === "historico" ? query.lista : "dia";
  if (lista === "dia") await openDuePackageVisits(user.accountId, user.id, day);
  const operator = user.role === "administrador" || user.role === "balcao";
  const own = user.role === "profissional" ? await linkedProfessional(user.id) : null;
  const today = todaySaoPaulo();
  const month = monthBounds(today);
  let start = dayParam(query.de ?? month.start);
  let end = dayParam(query.ate ?? today);
  if (start > end) [start, end] = [end, start];
  const tooLong = lista === "historico" && daysBetween(start, end) > SPAN;
  const q = query.q?.trim() ?? "";
  const openFilter: OpenFilter = isOpenFilter(query.filtro) ? query.filtro : "todas";
  const [orders, clients, listed] = await Promise.all([
    lista === "dia" ? dayOrders(user.accountId, day, own) : Promise.resolve([]),
    lista === "dia" && operator ? clientOptions(user.accountId) : Promise.resolve([]),
    lista === "abertas"
      ? listedOrders(user.accountId, "aberta", own, today, null, null, q || null)
      : lista === "historico" && !tooLong
        ? listedOrders(user.accountId, "fechada", own, today, start, end, q || null)
        : Promise.resolve([]),
  ]);
  const dayRows =
    lista !== "dia"
      ? []
      : !q
        ? orders
        : orders.filter((order) => {
            const text = q.toLowerCase();
            const digits = q.replace(/\D/g, "");
            const phone = (order.phone ?? "").replace(/\D/g, "");
            if (digits.length >= 3 && phone.includes(digits)) return true;
            return (
              (order.clientName ?? "").toLowerCase().includes(text) ||
              (order.professionalName ?? "").toLowerCase().includes(text) ||
              who(order).toLowerCase().includes(text)
            );
          });
  const openRows =
    lista === "abertas"
      ? listed
          .filter((row) => matchesOpen(row, openFilter, today))
          .sort((a, b) => {
            const gapA = gapOf(a);
            const gapB = gapOf(b);
            if (
              openFilter === "falta" ||
              openFilter === "atrasada" ||
              openFilter === "hoje" ||
              openFilter === "vencer" ||
              openFilter === "vazia" ||
              openFilter === "semnome"
            ) {
              if (a.day !== b.day) return (a.day ?? "").localeCompare(b.day ?? "");
              return gapB - gapA;
            }
            return 0;
          })
      : listed;
  const openDue = openRows.reduce((sum, row) => sum + Math.max(0, gapOf(row)), 0);
  const emptyBack = q
    ? `/comandas?lista=abertas&filtro=vazia&q=${encodeURIComponent(q)}`
    : "/comandas?lista=abertas&filtro=vazia";

  return (
    <Panel user={user} current="/comandas" title="Comandas">
      <div className="desk">
        <div className="desk-bar">
          <Link className={lista === "dia" ? "btn" : "btn quiet"} href={`/comandas?dia=${day}`}>
            Do dia
          </Link>
          <Link className={lista === "abertas" ? "btn" : "btn quiet"} href="/comandas?lista=abertas&filtro=falta">
            Abertas
          </Link>
          <Link
            className={lista === "historico" ? "btn" : "btn quiet"}
            href={`/comandas?lista=historico&de=${month.start}&ate=${today}`}
          >
            Histórico
          </Link>
          {lista === "dia" ? (
            <>
              <Link className="btn quiet" href={`/comandas?dia=${shiftDay(day, -1)}`}>
                ←
              </Link>
              <span className="day-label">{formatDay(day)}</span>
              <Link className="btn quiet" href={`/comandas?dia=${shiftDay(day, 1)}`}>
                →
              </Link>
              <Link className="btn quiet" href={`/comandas?dia=${today}`}>
                Hoje
              </Link>
              <Link className="btn quiet" href={`/agenda?dia=${day}`}>
                Agenda
              </Link>
              {operator ? (
                <Modal label="Nova comanda" title="Abrir comanda do dia" tone="blue">
                  <form action={openDayOrder}>
                    <input type="hidden" name="day" value={day} />
                    <label>
                      Cliente
                      <select name="client" required defaultValue="">
                        <option value="" disabled>
                          Escolha
                        </option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name}
                            {client.phone ? ` · ${formatPhone(client.phone)}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                    <SubmitButton label="Abrir" pendingLabel="Abrindo…" />
                  </form>
                </Modal>
              ) : null}
              <form className="desk-bar" action="/comandas" style={{ margin: 0, flex: "1 1 220px" }}>
                <input type="hidden" name="dia" value={day} />
                <input name="q" defaultValue={q} placeholder="Nome, celular ou profissional" aria-label="Busca" />
                <button className="btn quiet" type="submit">
                  Buscar
                </button>
              </form>
            </>
          ) : null}
        </div>

        <ErrorNote code={query.erro} />

        {lista === "dia" ? (
          dayRows.length === 0 ? (
            <p className="queue-empty">{q ? "Nenhuma comanda neste filtro." : "Nenhuma comanda neste dia."}</p>
          ) : (
            <div className="queue" style={{ overflowX: "auto" }}>
              <OrdersTable
                orders={dayRows}
                showDay={false}
                canClearEmpty={operator}
                emptyBack={q ? `/comandas?dia=${day}&q=${encodeURIComponent(q)}` : `/comandas?dia=${day}`}
              />
            </div>
          )
        ) : null}

        {lista === "abertas" ? (
          <>
            <div className="desk-bar">
              {OPEN_NOW.map((item) => (
                <Link
                  key={item.id}
                  className={item.id === openFilter ? "btn" : "btn quiet"}
                  href={
                    q
                      ? `/comandas?lista=abertas&filtro=${item.id}&q=${encodeURIComponent(q)}`
                      : `/comandas?lista=abertas&filtro=${item.id}`
                  }
                >
                  {item.label}
                </Link>
              ))}
              <Modal label="Outras" title="Outras abertas" tone="navy">
                {OPEN_MORE.map((item) => (
                  <Link
                    key={item.id}
                    className={item.id === openFilter ? "btn" : "btn quiet"}
                    href={
                      q
                        ? `/comandas?lista=abertas&filtro=${item.id}&q=${encodeURIComponent(q)}`
                        : `/comandas?lista=abertas&filtro=${item.id}`
                    }
                  >
                    {item.label}
                  </Link>
                ))}
              </Modal>
              {OPEN_MORE.some((item) => item.id === openFilter) ? (
                <span className="chip">{OPEN_MORE.find((item) => item.id === openFilter)?.label}</span>
              ) : null}
              <form className="desk-bar" action="/comandas" style={{ margin: 0, flex: "1 1 200px" }}>
                <input type="hidden" name="lista" value="abertas" />
                <input type="hidden" name="filtro" value={openFilter} />
                <input name="q" defaultValue={q} placeholder="Nome ou celular" aria-label="Busca" />
                <button className="btn quiet" type="submit">
                  Buscar
                </button>
              </form>
              <span className="chip">
                {openRows.length} · {openDue > 0 ? `a receber ${formatReais(openDue)}` : "em dia"}
              </span>
            </div>
            {openRows.length === 0 ? (
              <p className="queue-empty">Nenhuma comanda neste filtro.</p>
            ) : (
              <div className="queue" style={{ overflowX: "auto" }}>
                <OrdersTable
                  orders={openRows}
                  showDay
                  showSituation
                  today={today}
                  canClearEmpty={operator}
                  emptyBack={emptyBack}
                />
              </div>
            )}
          </>
        ) : null}

        {lista === "historico" ? (
          <>
            <form className="desk-bar" action="/comandas">
              <input type="hidden" name="lista" value="historico" />
              <label>
                De
                <input name="de" type="date" defaultValue={start} required />
              </label>
              <label>
                Até
                <input name="ate" type="date" defaultValue={end} required />
              </label>
              <input name="q" defaultValue={q} placeholder="Nome ou celular" aria-label="Busca" />
              <button className="btn" type="submit">
                Ver
              </button>
            </form>
            {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
            {!tooLong && listed.length === 0 ? (
              <p className="queue-empty">Nenhuma comanda fechada neste período.</p>
            ) : null}
            {!tooLong && listed.length > 0 ? (
              <div className="queue" style={{ overflowX: "auto" }}>
                <OrdersTable orders={listed} showDay />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Panel>
  );
}
