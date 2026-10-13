import Link from "next/link";
import { requireAdmin } from "@/catalog/access";
import { formatPhone, formatReais, todaySaoPaulo } from "@/catalog/format";
import { listReceivables, type ReceivableRow } from "@/catalog/queries";
import { shiftDay } from "@/desk/clock";
import { FinanceNav } from "@/ui/finance-nav";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "abertos", label: "Abertas" },
  { id: "atrasado", label: "Atrasadas" },
  { id: "semana", label: "Na semana" },
  { id: "vencer", label: "A vencer" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function isFilter(value: string | undefined): value is FilterId {
  return FILTERS.some((item) => item.id === value);
}

function situation(row: ReceivableRow, today: string, week: string) {
  if (row.dayIso < today) return "atrasado";
  if (row.dayIso <= week) return "semana";
  return "vencer";
}

function situationLabel(value: string) {
  if (value === "atrasado") return "Atrasada";
  if (value === "semana") return "Na semana";
  return "A vencer";
}

export default async function ReceivablesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const user = await requireAdmin();
  const query = await searchParams;
  const filter: FilterId = isFilter(query.filtro) ? query.filtro : "abertos";
  const today = todaySaoPaulo();
  const week = shiftDay(today, 7);
  const rows = (await listReceivables(user.accountId)).filter((row) => {
    if (filter === "abertos") return true;
    return situation(row, today, week) === filter;
  });
  const total = rows.reduce((sum, row) => sum + (row.totalCents - row.paidCents), 0);

  return (
    <Panel user={user} current="/financeiro" title="Contas a receber">
      <p>O que o cliente ainda deve. O recebimento continua na comanda. Sem banco, entra na gaveta. Com banco, entra no extrato.</p>
      <FinanceNav current="receber" />
      <div className="row">
        {FILTERS.map((item) => (
          <Link key={item.id} className={item.id === filter ? "btn" : "btn quiet"} href={`/financeiro/receber?filtro=${item.id}`}>
            {item.label}
          </Link>
        ))}
      </div>
      <div className="card">
        <p>
          {rows.length} {rows.length === 1 ? "título" : "títulos"} · {formatReais(total)}
        </p>
        {rows.length === 0 ? <p>Nenhuma conta neste filtro.</p> : null}
        {rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Comanda</th>
                <th>Pago</th>
                <th>Em aberto</th>
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.day}</td>
                  <td>{row.clientName}</td>
                  <td>{row.phone ? formatPhone(row.phone) : ""}</td>
                  <td>{formatReais(row.totalCents)}</td>
                  <td>{formatReais(row.paidCents)}</td>
                  <td>{formatReais(row.totalCents - row.paidCents)}</td>
                  <td>{situationLabel(situation(row, today, week))}</td>
                  <td>
                    <Link className="btn quiet" href={`/comandas/${row.id}`}>
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
