import Link from "next/link";
import { redirect } from "next/navigation";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, shiftDay } from "@/desk/clock";
import { linkedProfessional, ownCommission } from "@/desk/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const ORIGIN: Record<string, string> = {
  execucao: "Execução",
  abate: "Abate",
  indicacao: "Indicação",
};

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ dia?: string }>;
}) {
  const user = await requireDesk();
  if (user.role !== "profissional") redirect("/caixa");
  const own = await linkedProfessional(user.id);
  const query = await searchParams;
  const day = dayParam(query.dia);
  const mine = own ? await ownCommission(user.accountId, own, day) : null;

  return (
    <Panel user={user} current="/comissao" title="Comissão">
      <div className="row">
        <Link className="btn quiet" href={`/comissao?dia=${shiftDay(day, -1)}`}>
          Dia anterior
        </Link>
        <strong>{formatDay(day)}</strong>
        <Link className="btn quiet" href={`/comissao?dia=${shiftDay(day, 1)}`}>
          Próximo dia
        </Link>
        <Link className="btn quiet" href={`/comissao?dia=${todaySaoPaulo()}`}>
          Hoje
        </Link>
      </div>
      {!mine ? <p>Este acesso ainda não está ligado a um profissional.</p> : null}
      {mine ? (
        <>
          <div className="tiles">
            <div className="stat">
              <strong>{formatReais(mine.commissionCents)}</strong>
              <span>Comissão</span>
            </div>
            <div className="stat">
              <strong>{formatReais(mine.abatementCents)}</strong>
              <span>Abate</span>
            </div>
          </div>
          <div className="card">
            <h2>Do dia</h2>
            <p>Só o que é seu. Execução, indicação e o abate do que você recebeu ou consumiu.</p>
            {mine.rows.length === 0 ? <p>Nenhuma linha sua neste dia.</p> : null}
            {mine.rows.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Origem</th>
                    <th>Linha</th>
                    <th>Comissão</th>
                    <th>Abate</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.rows.map((row, index) => (
                    <tr key={`${row.origin}-${row.description}-${index}`}>
                      <td>{ORIGIN[row.origin] ?? row.origin}</td>
                      <td>{row.description}</td>
                      <td>{formatReais(row.commissionCents)}</td>
                      <td>{formatReais(row.abatementCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
        </>
      ) : null}
    </Panel>
  );
}
