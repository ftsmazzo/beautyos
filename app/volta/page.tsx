import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatPhone, todaySaoPaulo } from "@/catalog/format";
import { returnRegister } from "@/desk/queries";
import { RETURN_OUTCOMES, RETURN_WORD, type ReturnOutcome } from "@/desk/returns";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const FILTERS = [
  { id: "todas", label: "Todas" },
  ...RETURN_OUTCOMES.map((id) => ({ id, label: RETURN_WORD[id] })),
] as const;

function isFilter(value: string | undefined): value is "todas" | ReturnOutcome {
  return value === "todas" || RETURN_OUTCOMES.some((item) => item === value);
}

export default async function ReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const filter = isFilter(query.filtro) ? query.filtro : "todas";
  const rows = await returnRegister(user.accountId, todaySaoPaulo());
  const visible = filter === "todas" ? rows : rows.filter((row) => row.outcome === filter);

  return (
    <Panel user={user} current="/volta" title="Volta">
      <p>
        De fora fica só neste registro. O primeiro pacote ativo continua na ficha. Renovou é um pacote ativo depois de outro que já acabou. Não renovou e veio avulso é a visita paga depois que o pacote acabou. Não renovou e não veio é o prazo do pacote que passou sem outra visita. Voltou no prazo é a volta dentro dos dias do serviço, com a janela ainda aberta. Passou e não voltou é a data que já venceu, sem horário marcado.
      </p>
      <div className="row">
        {FILTERS.map((item) => (
          <Link key={item.id} className={item.id === filter ? "btn" : "btn quiet"} href={item.id === "todas" ? "/volta" : `/volta?filtro=${item.id}`}>
            {item.label}
          </Link>
        ))}
      </div>
      <div className="card">
        {visible.length === 0 ? <p>Ninguém neste filtro.</p> : null}
        {visible.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Serviço</th>
                <th>Última</th>
                <th>Situação</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={`${row.id}-${row.serviceId}`}>
                  <td>
                    <Link href={`/clientes/${row.id}`}>{row.name}</Link>
                  </td>
                  <td>{row.phone ? formatPhone(row.phone) : "—"}</td>
                  <td>{row.service}</td>
                  <td>{formatDay(row.day)}</td>
                  <td>{row.word}</td>
                  <td>
                    {row.outcome === "passou" || row.outcome === "nao_veio" ? (
                      <Link href={`/agenda?cliente=${row.id}&servico=${row.serviceId}`}>Agendar</Link>
                    ) : null}
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
