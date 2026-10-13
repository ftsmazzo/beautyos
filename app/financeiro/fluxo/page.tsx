import Link from "next/link";
import { requireAdmin } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { WEEKDAYS } from "@/catalog/labels";
import { shiftDay, shiftMonth, weekdayOf } from "@/desk/clock";
import { listFlowGroups, listOutflowDays, listResultGroups } from "@/finance/queries";
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

function DayTable({ rows }: { rows: { day: string; totalCents: number }[] }) {
  const total = rows.reduce((sum, row) => sum + row.totalCents, 0);
  return (
    <table>
      <thead>
        <tr>
          <th>Dia</th>
          <th>Saídas</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.day}>
            <td>
              {WEEKDAYS[weekdayOf(row.day)]} {formatDay(row.day)}
            </td>
            <td>{formatReais(row.totalCents)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>{formatReais(total)}</td>
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
  const [flow, result, moved] = await Promise.all([
    listFlowGroups(user.accountId, start, next),
    listResultGroups(user.accountId, start, next),
    listOutflowDays(user.accountId, start, next),
  ]);
  const byDay = new Map(moved.map((row) => [row.day, row.totalCents]));
  const days = daysOfMonth(start, next).map((day) => ({ day, totalCents: byDay.get(day) ?? 0 }));

  return (
    <Panel user={user} current="/financeiro" title="Fluxo e resultado">
      <FinanceNav current="fluxo" />
      <p className="muted">
        {monthLabel(month)}. Cada dia mostra o que saiu do banco. O mesmo total aparece de novo pelo grupo do plano. O caixa do balcão continua separado.
      </p>
      <div className="row">
        <Link className="btn quiet" href={`/financeiro/fluxo?mes=${previous}`}>
          Mês anterior
        </Link>
        <Link className="btn quiet" href={`/financeiro/fluxo?mes=${following}`}>
          Mês seguinte
        </Link>
      </div>
      <h2>Dia a dia</h2>
      <DayTable rows={days} />
      <h2>Fluxo</h2>
      <GroupTable rows={flow} />
      <h2>Resultado</h2>
      <GroupTable rows={result} />
    </Panel>
  );
}
