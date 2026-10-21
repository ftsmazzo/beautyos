import Link from "next/link";
import { requireAdmin } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { WEEKDAYS } from "@/catalog/labels";
import { shiftDay, shiftMonth, weekdayOf } from "@/desk/clock";
import { listFlowGroups, listInflowDays, listInflowMonths, listOutflowDays, listOutflowMonths, listResultGroups } from "@/finance/queries";
import { FinanceNav } from "@/ui/finance-nav";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function monthParam(value: string | undefined) {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  return todaySaoPaulo().slice(0, 7);
}

function monthLabel(month: string) {
  const [year, index] = month.split("-");
  return `${MONTHS[Number(index) - 1]} de ${year}`;
}

function daysOfMonth(start: string, next: string) {
  const days: string[] = [];
  let cursor = start;
  while (cursor < next) {
    days.push(cursor);
    cursor = shiftDay(cursor, 1);
  }
  return days;
}

function monthsEnding(month: string) {
  const keys: string[] = [];
  let cursor = shiftMonth(`${month}-01`, -11);
  while (cursor.slice(0, 7) <= month) {
    keys.push(cursor.slice(0, 7));
    cursor = shiftMonth(cursor, 1);
  }
  return keys;
}

function MonthTable({ rows }: { rows: { month: string; inCents: number; outCents: number }[] }) {
  const inflow = rows.reduce((sum, row) => sum + row.inCents, 0);
  const outflow = rows.reduce((sum, row) => sum + row.outCents, 0);
  return (
    <table>
      <thead>
        <tr>
          <th>Mês</th>
          <th>Entradas</th>
          <th>Saídas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.month}>
            <td>
              <Link href={`/financeiro/fluxo?mes=${row.month}`}>{monthLabel(row.month)}</Link>
            </td>
            <td>{formatReais(row.inCents)}</td>
            <td>{formatReais(row.outCents)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>{formatReais(inflow)}</td>
          <td>{formatReais(outflow)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function DayTable({ rows }: { rows: { day: string; inCents: number; outCents: number }[] }) {
  const inflow = rows.reduce((sum, row) => sum + row.inCents, 0);
  const outflow = rows.reduce((sum, row) => sum + row.outCents, 0);
  return (
    <table>
      <thead>
        <tr>
          <th>Dia</th>
          <th>Entradas</th>
          <th>Saídas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.day}>
            <td>
              {WEEKDAYS[weekdayOf(row.day)]} {formatDay(row.day)}
            </td>
            <td>{formatReais(row.inCents)}</td>
            <td>{formatReais(row.outCents)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>{formatReais(inflow)}</td>
          <td>{formatReais(outflow)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function GroupTable({ rows }: { rows: { group: string; totalCents: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.totalCents, 0);
  return (
    <table>
      <thead>
        <tr>
          <th>Grupo</th>
          <th>Saídas</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={2}>Nenhuma saída do banco neste mês.</td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr key={row.group}>
              <td>{row.group}</td>
              <td>{formatReais(row.totalCents)}</td>
            </tr>
          ))
        )}
      </tbody>
      {rows.length > 0 ? (
        <tfoot>
          <tr>
            <td>Total</td>
            <td>{formatReais(total)}</td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

export default async function FluxoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireAdmin();
  const query = await searchParams;
  const month = monthParam(query.mes);
  const start = `${month}-01`;
  const next = shiftMonth(start, 1);
  const previous = shiftMonth(start, -1).slice(0, 7);
  const following = next.slice(0, 7);
  const windowStart = shiftMonth(start, -11);
  const [flow, result, moved, movedMonths, received, receivedMonths] = await Promise.all([
    listFlowGroups(user.accountId, start, next),
    listResultGroups(user.accountId, start, next),
    listOutflowDays(user.accountId, start, next),
    listOutflowMonths(user.accountId, windowStart, next),
    listInflowDays(user.accountId, start, next),
    listInflowMonths(user.accountId, windowStart, next),
  ]);
  const outByDay = new Map(moved.map((row) => [row.day, row.totalCents]));
  const inByDay = new Map(received.map((row) => [row.day, row.totalCents]));
  const days = daysOfMonth(start, next).map((day) => ({
    day,
    inCents: inByDay.get(day) ?? 0,
    outCents: outByDay.get(day) ?? 0,
  }));
  const outByMonth = new Map(movedMonths.map((row) => [row.day, row.totalCents]));
  const inByMonth = new Map(receivedMonths.map((row) => [row.day, row.totalCents]));
  const months = monthsEnding(month).map((key) => ({
    month: key,
    inCents: inByMonth.get(key) ?? 0,
    outCents: outByMonth.get(key) ?? 0,
  }));

  return (
    <Panel user={user} current="/financeiro" title="Fluxo e resultado">
      <div className="desk">
      <FinanceNav current="fluxo" />
      <div className="desk-bar">
        <Link className="btn quiet" href={`/financeiro/fluxo?mes=${previous}`}>
          ←
        </Link>
        <span className="day-label">{monthLabel(month)}</span>
        <Link className="btn quiet" href={`/financeiro/fluxo?mes=${following}`}>
          →
        </Link>
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="queue-head"><h2>Doze meses</h2></div>
        <MonthTable rows={months} />
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="queue-head"><h2>Dia a dia</h2></div>
        <DayTable rows={days} />
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="queue-head"><h2>Fluxo</h2></div>
        <GroupTable rows={flow} />
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="queue-head"><h2>Resultado</h2></div>
        <GroupTable rows={result} />
      </div>
      </div>
    </Panel>
  );
}
