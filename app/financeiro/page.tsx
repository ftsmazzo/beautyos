import Link from "next/link";
import { requireAdmin } from "@/catalog/access";
import { formatReais, todaySaoPaulo } from "@/catalog/format";
import { listPayables, type PayableRow } from "@/catalog/queries";
import { shiftDay } from "@/desk/clock";
import { deleteTitle, stopRecurrence } from "@/finance/actions";
import { materializeRecurrences } from "@/finance/recurrence";
import { listBanks, listCards, listChart } from "@/finance/queries";
import { ErrorNote, SavedNote } from "@/ui/error-note";
import { FinanceNav } from "@/ui/finance-nav";
import { Panel } from "@/ui/panel";
import { PayableForm } from "@/ui/payable-form";
import { PayableSettle } from "@/ui/payable-settle";
import { SubmitButton } from "@/ui/submit-button";

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
  await materializeRecurrences(user.accountId);
  const banks = (await listBanks(user.accountId)).map((bank) => ({ id: bank.id, name: bank.name }));
  const cards = (await listCards(user.accountId)).map((card) => ({ id: card.id, name: card.name }));
  const charts = (await listChart(user.accountId)).map((chart) => ({ id: chart.id, code: chart.code, name: chart.name }));
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
      <p>Aluguel e luz entram aqui, sem compra de produto. Repetir todo mês lança o mesmo valor de novo, e o mês que chega entra no dia, com a tela fechada ou aberta. Estas contas não entram no caixa do balcão. No crédito, o título fica na fatura. O banco sai quando a fatura é paga.</p>
      <FinanceNav current="pagar" />
      <PayableForm banks={banks} cards={cards} charts={charts} today={today} />
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
                <th>Plano</th>
                <th>Parcela</th>
                <th>Valor</th>
                <th>Situação</th>
                <th>Forma</th>
                <th>Lançamento</th>
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
                    <td>{row.chartName ?? ""}</td>
                    <td>
                      {row.installmentIndex}/{row.installmentTotal}
                    </td>
                    <td>{formatReais(row.amountCents)}</td>
                    <td>{situationLabel(state)}{row.paid ? ` · ${row.paid}` : ""}</td>
                    <td>{method}{row.cardBrand ? ` · ${row.cardBrand}` : ""}</td>
                    <td>
                      <div className="row">
                        {row.bankName ?? row.cardName ?? (
                          <PayableSettle
                            id={row.id}
                            banks={banks}
                            cards={cards}
                            charts={charts}
                            today={today}
                            paid={Boolean(row.paid)}
                            method={row.method}
                          />
                        )}
                        {row.recurrenceActive && row.recurrenceId ? (
                          <form action={stopRecurrence}>
                            <input type="hidden" name="id" value={row.recurrenceId} />
                            <SubmitButton label="Encerrar" pendingLabel="Encerrando…" className="quiet" />
                          </form>
                        ) : null}
                        {row.manual ? (
                          <form action={deleteTitle}>
                            <input type="hidden" name="id" value={row.id} />
                            <SubmitButton label="Excluir" pendingLabel="Excluindo…" className="quiet" />
                          </form>
                        ) : null}
                      </div>
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
