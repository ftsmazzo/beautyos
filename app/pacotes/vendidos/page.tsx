import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, formatReais, packageDeadline, todaySaoPaulo } from "@/catalog/format";
import { sellPackageOnDay } from "@/desk/actions";
import { clientOptions, dayRoster, packagesForSale, soldPackages, type SoldPackage } from "@/desk/queries";
import { paymentMethodsLabel } from "@/desk/statuses";
import { ErrorNote } from "@/ui/error-note";
import { Modal } from "@/ui/modal";
import { Panel } from "@/ui/panel";
import { SoldColumns } from "@/ui/sold-columns";
import { SubmitButton } from "@/ui/submit-button";

function paidLabel(row: SoldPackage) {
  const parts = [formatReais(row.paidCents)];
  const methods = paymentMethodsLabel(row.payMethods);
  if (methods) parts.push(methods);
  if (row.paidCents < row.priceCents) parts.push(`falta ${formatReais(row.priceCents - row.paidCents)}`);
  return parts.join(" · ");
}

export const dynamic = "force-dynamic";

const NOW = [
  { id: "aberto", label: "Ativas" },
  { id: "receber", label: "A receber" },
  { id: "expirado", label: "Vencidas" },
  { id: "falta", label: "Falta agendar" },
] as const;

const FILE = [
  { id: "estourado", label: "Estouradas sem perdão" },
  { id: "perdoado", label: "Perdoadas" },
  { id: "concluido", label: "Concluídas" },
  { id: "cancelado", label: "Canceladas" },
  { id: "encerrado", label: "Encerradas" },
] as const;

const FILTERS = [...NOW, ...FILE] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function isFilter(value: string | undefined): value is FilterId {
  return FILTERS.some((item) => item.id === value);
}

function matches(row: SoldPackage, filter: FilterId) {
  if (filter === "aberto") return row.status === "ativo" && !row.expired && !row.late;
  if (filter === "receber") return row.status !== "cancelado" && row.paidCents < row.priceCents;
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
  searchParams: Promise<{ filtro?: string; erro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const filter: FilterId = isFilter(query.filtro) ? query.filtro : "aberto";
  const today = todaySaoPaulo();
  const [rows, people, catalog, roster] = await Promise.all([
    soldPackages(user.accountId, today),
    clientOptions(user.accountId),
    packagesForSale(user.accountId),
    dayRoster(user.accountId, null),
  ]);
  const visible = rows.filter((row) => matches(row, filter));

  return (
    <Panel user={user} current="/pacotes/vendidos" title="Pacotes vendidos">
      <div className="desk">
      <ErrorNote code={query.erro} />
      <div className="desk-bar">
      {catalog.length > 0 && people.length > 0 ? (
        <Modal label="Vender" title="Vender pacote" tone="teal">
          <form action={sellPackageOnDay}>
            <label>
              Cliente
              <select name="client" required defaultValue="">
                <option value="">Escolha</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Pacote
              <select name="package" required defaultValue="">
                <option value="">Escolha</option>
                {catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {formatReais(item.priceCents)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Quem vendeu
              <select name="seller" defaultValue="">
                <option value="">Sem incentivo</option>
                {roster.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.nickname || person.name}
                  </option>
                ))}
              </select>
            </label>
            <SubmitButton label="Vender" pendingLabel="Vendendo…" className="teal" />
          </form>
        </Modal>
      ) : null}
        <Link className="btn quiet" href="/pacotes/relatorio">
          Relatório
        </Link>
        {NOW.map((item) => (
          <Link key={item.id} className={item.id === filter ? "btn" : "btn quiet"} href={`/pacotes/vendidos?filtro=${item.id}`}>
            {item.label}
          </Link>
        ))}
        <Modal label="Arquivo" title="Arquivo" tone="navy">
          {FILE.map((item) => (
            <Link key={item.id} className={item.id === filter ? "btn" : "btn quiet"} href={`/pacotes/vendidos?filtro=${item.id}`}>
              {item.label}
            </Link>
          ))}
        </Modal>
        {FILE.some((item) => item.id === filter) ? (
          <span className="chip">{FILE.find((item) => item.id === filter)?.label}</span>
        ) : null}
        <span className="chip">{visible.length}</span>
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        {visible.length === 0 ? <p className="queue-empty">Nenhum pacote neste filtro.</p> : null}
        {visible.length > 0 ? (
          <SoldColumns
            rows={visible.map((row) => ({
              id: row.id,
              clientName: row.clientName,
              phone: row.phone ? formatPhone(row.phone) : "—",
              name: row.name,
              visits: `${row.used} de ${row.total}`,
              nextVisit: row.nextVisit ?? "—",
              situation: situation(row),
              paid: paidLabel(row),
            }))}
          />
        ) : null}
      </div>
      </div>
    </Panel>
  );
}
