import Link from "next/link";
import { requireAdmin } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { listPayables, type PayableRow } from "@/catalog/queries";
import { shiftDay } from "@/desk/clock";
import { listBanks } from "@/finance/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { FinanceNav } from "@/ui/finance-nav";
import { Panel } from "@/ui/panel";
import { PayableSettle } from "@/ui/payable-settle";

export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "abertos", label: "Abertas" },
  { id: "atrasado", label: "Atrasadas" },
  { id: "semana", label: "Na semana" },
  { id: "pago", label: "Pagas" },
  { id: "todos", label: "Todas" },
] as const;

const METHODS: Record<string, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Débito",
  credito: "Crédito",
  outros: "Outros",
};

type FilterId = (typeof FILTERS)[number]["id"];

function isFilter(value: string | undefined): value is FilterId {
  return FILTERS.some((item) => item.id === value);
}

function situation(row: PayableRow, today: string, week: string) {
  if (row.paid) return "pago";
  if (row.dueIso < today) return "atrasado";
  if (row.dueIso <= week) return "semana";
  return "aberto";
}

function situationLabel(value: string) {
  if (value === "pago") return "Paga";
  if (value === "atrasado") return "Atrasada";
  if (value === "semana") return "Na semana";
  return "Aberta";
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; ok?: string; erro?: string }>;
}) {
  const user = await requireAdmin();
  const query = await searchParams;
  const filter: FilterId = isFilter(query.filtro) ? query.filtro : "abertos";
  const today = todaySaoPaulo();
  const week = shiftDay(today, 7);
  const banks = (await listBanks(user.accountId)).map((bank) => ({ id: bank.id, name: bank.name }));
  const rows = (await listPayables(user.accountId)).filter((row) => {
    const state = situation(row, today, week);
    if (filter === "todos") return true;
    if (filter === "abertos") return state !== "pago";
    return state === filter;
  });
  const total = rows.reduce((sum, row) => sum + row.amountCents, 0);

  return (
    <Panel user={user} current="/financeiro" title="Contas a pagar">
      <SavedNote code={query.ok} />
      <ErrorNote code={query.erro} />
      <p>Estas contas não entram no caixa do balcão. A baixa sai do banco escolhido.</p>
      <FinanceNav current="pagar" />
      <div className="row">
        {FILTERS.map((item) => (
          <Link key={item.id} className={item.id === filter ? "btn" : "btn quiet"} href={`/financeiro?filtro=${item.id}`}>
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
                <th>Vencimento</th>
                <th>Fornecedor</th>
                <th>Nota</th>
                <th>Parcela</th>
                <th>Valor</th>
                <th>Situação</th>
                <th>Forma</th>
                <th>Banco</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const state = situation(row, today, week);
                const method = row.method ? METHODS[row.method] ?? row.method : "";
                return (
                  <tr key={row.id}>
                    <td>{row.due}</td>
                    <td>{row.partyName}</td>
                    <td>{row.description}</td>
                    <td>
                      {row.installmentIndex}/{row.installmentTotal}
                    </td>
                    <td>{formatReais(row.amountCents)}</td>
                    <td>{situationLabel(state)}{row.paid ? ` · ${row.paid}` : ""}</td>
                    <td>{method}{row.cardBrand ? ` · ${row.cardBrand}` : ""}</td>
                    <td>
                      {row.bankName ? (
                        row.bankName
                      ) : (
                        <PayableSettle id={row.id} banks={banks} today={today} paid={Boolean(row.paid)} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </Panel>
  );
}
