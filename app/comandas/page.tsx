import Link from "next/link";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatPhone, formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds, shiftDay } from "@/desk/clock";
import { openDayOrder, openDuePackageVisits } from "@/desk/actions";
import { clientOptions, dayOrders, linkedProfessional, listedOrders } from "@/desk/queries";
import { ErrorNote } from "@/ui/error-note";
import { Panel } from "@/ui/panel";
import { SubmitButton } from "@/ui/submit-button";

export const dynamic = "force-dynamic";

const SPAN = 92;

const OPEN_FILTERS = [
  { id: "todas", label: "Todas" },
  { id: "falta", label: "Com falta" },
  { id: "atrasada", label: "Atrasadas" },
  { id: "hoje", label: "Hoje" },
  { id: "vencer", label: "A vencer" },
  { id: "credito", label: "Com crédito" },
] as const;

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

function openSituation(order: OrderRow, today: string) {
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
}: {
  orders: OrderRow[];
  showDay: boolean;
  showSituation?: boolean;
  today?: string;
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
          return (
            <tr key={order.id}>
              {showDay && order.day ? <td data-label="Dia">{formatDay(order.day)}</td> : null}
              <td data-label="Quem">
                <strong>{who(order)}</strong>
                {order.phone ? <div>{formatPhone(order.phone)}</div> : null}
                {order.packageNote ? <div>{order.packageNote}</div> : null}
                {order.incomplete ? <div>Cadastro pendente</div> : null}
              </td>
              <td data-label="Tipo">{order.kind === "consumo" ? "Consumo" : "Cliente"}</td>
              <td data-label="Estado">{order.status === "fechada" ? "Fechada" : "Aberta"}</td>
              {showSituation && today ? <td data-label="Situação">{openSituation(order, today)}</td> : null}
              <td data-label="Total">{formatReais(order.totalCents)}</td>
              <td data-label="Pago">{formatReais(order.paidCents)}</td>
              <td data-label="Falta">{gap > 0 ? formatReais(gap) : gap < 0 ? `crédito ${formatReais(-gap)}` : "—"}</td>
              <td>
                <Link href={`/comandas/${order.id}`}>Abrir</Link>
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
  const openRows =
    lista === "abertas"
      ? listed
          .filter((row) => matchesOpen(row, openFilter, today))
          .sort((a, b) => {
            const gapA = gapOf(a);
            const gapB = gapOf(b);
            if (openFilter === "falta" || openFilter === "atrasada" || openFilter === "hoje" || openFilter === "vencer") {
              if (a.day !== b.day) return (a.day ?? "").localeCompare(b.day ?? "");
              return gapB - gapA;
            }
            return 0;
          })
      : listed;
  const openDue = openRows.reduce((sum, row) => sum + Math.max(0, gapOf(row)), 0);

  return (
    <Panel user={user} current="/comandas" title="Comandas">
      <div className="row">
        <Link className={lista === "dia" ? "btn" : "btn quiet"} href={`/comandas?dia=${day}`}>
          Do dia
        </Link>
        <Link className={lista === "abertas" ? "btn" : "btn quiet"} href="/comandas?lista=abertas&filtro=falta">
          Abertas
        </Link>
        <Link className={lista === "historico" ? "btn" : "btn quiet"} href={`/comandas?lista=historico&de=${month.start}&ate=${today}`}>
          Histórico
        </Link>
      </div>
      {lista === "dia" ? (
        <>
          <div className="row">
            <Link className="btn quiet" href={`/comandas?dia=${shiftDay(day, -1)}`}>
              Dia anterior
            </Link>
            <strong>{formatDay(day)}</strong>
            <Link className="btn quiet" href={`/comandas?dia=${shiftDay(day, 1)}`}>
              Próximo dia
            </Link>
            <Link className="btn quiet" href={`/comandas?dia=${today}`}>
              Hoje
            </Link>
            <Link className="btn" href={`/agenda?dia=${day}`}>
              Agenda do dia
            </Link>
            {operator ? (
              <Link className="btn quiet" href="/pacotes/vendidos">
                Prazos dos pacotes
              </Link>
            ) : null}
          </div>
          <ErrorNote code={query.erro} />
          {operator ? (
            <form action={openDayOrder} className="card">
              <h2>Comanda do dia</h2>
              <p>Produto entra sem horário. Serviço entra na comanda e precisa de profissional e hora para fechar. Quem já tem comanda neste dia abre a mesma.</p>
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
              <SubmitButton label="Abrir comanda" pendingLabel="Abrindo…" />
            </form>
          ) : null}
          <div className="card">
            {orders.length === 0 ? <p>Nenhuma comanda neste dia.</p> : null}
            <OrdersTable orders={orders} showDay={false} />
          </div>
        </>
      ) : null}
      {lista === "abertas" ? (
        <div className="card">
          <h2>Abertas</h2>
          <p>Qualquer dia. A mais antiga vem primeiro. Fechar e receber continua na própria comanda.</p>
          <div className="row">
            {OPEN_FILTERS.map((item) => (
              <Link
                key={item.id}
                className={item.id === openFilter ? "btn" : "btn quiet"}
                href={q ? `/comandas?lista=abertas&filtro=${item.id}&q=${encodeURIComponent(q)}` : `/comandas?lista=abertas&filtro=${item.id}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <form className="row" action="/comandas">
            <input type="hidden" name="lista" value="abertas" />
            <input type="hidden" name="filtro" value={openFilter} />
            <label>
              Busca
              <input name="q" defaultValue={q} placeholder="Nome ou celular" />
            </label>
            <button className="btn" type="submit">
              Buscar
            </button>
          </form>
          <p>
            {openRows.length} {openRows.length === 1 ? "comanda" : "comandas"}
            {openDue > 0 ? ` · a receber ${formatReais(openDue)}` : ""}
          </p>
          {openRows.length === 0 ? <p>Nenhuma comanda neste filtro.</p> : null}
          <OrdersTable orders={openRows} showDay showSituation today={today} />
        </div>
      ) : null}
      {lista === "historico" ? (
        <div className="card">
          <h2>Histórico</h2>
          <p>Só as fechadas. A busca é por nome ou celular.</p>
          <form className="row" action="/comandas">
            <input type="hidden" name="lista" value="historico" />
            <label>
              De
              <input name="de" type="date" defaultValue={start} required />
            </label>
            <label>
              Até
              <input name="ate" type="date" defaultValue={end} required />
            </label>
            <label>
              Busca
              <input name="q" defaultValue={q} placeholder="Nome ou celular" />
            </label>
            <button className="btn" type="submit">
              Ver
            </button>
          </form>
          {tooLong ? <p className="error">O período fica em até {SPAN} dias.</p> : null}
          {!tooLong && listed.length === 0 ? <p>Nenhuma comanda fechada neste período.</p> : null}
          {!tooLong ? <OrdersTable orders={listed} showDay /> : null}
        </div>
      ) : null}
    </Panel>
  );
}
