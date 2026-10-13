import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, formatReais, packageDeadline, todaySaoPaulo } from "@/catalog/format";
import { soldPackages, type SoldPackage } from "@/desk/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "aberto", label: "Ativas" },
  { id: "expirado", label: "Vencidas" },
  { id: "estourado", label: "Estouradas sem perdão" },
  { id: "perdoado", label: "Perdoadas" },
  { id: "falta", label: "Falta agendar" },
  { id: "concluido", label: "Concluídas" },
  { id: "cancelado", label: "Canceladas" },
  { id: "encerrado", label: "Encerradas" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function isFilter(value: string | undefined): value is FilterId {
  return FILTERS.some((item) => item.id === value);
}

function matches(row: SoldPackage, filter: FilterId) {
  if (filter === "aberto") return row.status === "ativo" && !row.expired && !row.late;
  if (filter === "expirado") return row.status === "ativo" && (row.expired || row.late);
  if (filter === "estourado") return row.status === "ativo" && row.late && row.pardons === 0;
  if (filter === "perdoado") return row.status === "ativo" && row.pardons > 0;
  if (filter === "falta") return row.status === "ativo" && row.waiting;
  return row.status === filter;
}

function situation(row: SoldPackage) {
  if (row.status === "concluido") return "Concluído";
  if (row.status === "cancelado") return "Cancelado";
  if (row.status === "encerrado") return "Encerrado";
  const deadline = packageDeadline({
    started: row.started,
    validUntil: row.validUntil ? formatDay(row.validUntil) : null,
    expired: row.expired,
    late: row.late,
  });
  return row.pardons > 0 ? `${deadline} · já houve perdão` : deadline;
}

export default async function SoldPackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const filter: FilterId = isFilter(query.filtro) ? query.filtro : "aberto";
  const today = todaySaoPaulo();
  const rows = (await soldPackages(user.accountId, today)).filter((row) => matches(row, filter));

  return (
    <Panel user={user} current="/pacotes/vendidos" title="Pacotes vendidos">
      <div className="row">
        <Link className="btn quiet" href="/pacotes/relatorio">
          Relatório
        </Link>
        {FILTERS.map((item) => (
          <Link key={item.id} className={item.id === filter ? "btn" : "btn quiet"} href={`/pacotes/vendidos?filtro=${item.id}`}>
            {item.label}
          </Link>
        ))}
      </div>
      <div className="card">
        {rows.length === 0 ? <p>Nenhum pacote neste filtro.</p> : null}
        {rows.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Pacote</th>
                <th>Idas</th>
                <th>Próxima</th>
                <th>Prazo</th>
                <th>Venda</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.clientName}</td>
                  <td>{row.phone ? formatPhone(row.phone) : "—"}</td>
                  <td>{row.name}</td>
                  <td>{row.used} de {row.total}</td>
                  <td>{row.nextVisit ?? "—"}</td>
                  <td>{situation(row)}</td>
                  <td>{formatReais(row.priceCents)}</td>
                  <td>
                    <Link href={`/pacotes/vendidos/${row.id}`}>Ver</Link>
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
