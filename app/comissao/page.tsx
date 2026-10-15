import Link from "next/link";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { listProfessionals } from "@/catalog/queries";
import { dayParam, daysBetween, monthBounds, weekBounds } from "@/desk/clock";
import { commissionBook, linkedProfessional, type CommissionLine } from "@/desk/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SPAN = 92;

const ORIGIN: Record<string, string> = {
  execucao: "Execução",
  venda: "Venda do pacote",
  abate: "Abate",
  indicacao: "Indicação",
};

function periodHref(start: string, end: string, professional: string) {
  const who = professional ? `&profissional=${professional}` : "";
  return `/comissao?de=${start}&ate=${end}${who}`;
}

function peopleOf(rows: CommissionLine[]) {
  const map = new Map<string, { id: string; name: string; commissionCents: number; referralCents: number; abatementCents: number; feeCents: number }>();
  for (const row of rows) {
    const current = map.get(row.personId) ?? {
      id: row.personId,
      name: row.personName,
      commissionCents: 0,
      referralCents: 0,
      abatementCents: 0,
      feeCents: 0,
    };
    if (row.origin === "indicacao") current.referralCents += row.commissionCents;
    else current.commissionCents += row.commissionCents;
    current.abatementCents += row.abatementCents;
    current.feeCents += row.feeCents;
    map.set(row.personId, current);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export default async function CommissionPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; profissional?: string }>;
}) {
  const user = await requireDesk();
  const query = await searchParams;
  const today = todaySaoPaulo();
  let start = dayParam(query.de);
  let end = dayParam(query.ate);
  if (start > end) [start, end] = [end, start];
  const tooLong = daysBetween(start, end) > SPAN;
  const operator = user.role === "administrador" || user.role === "balcao";
  const own = user.role === "profissional" ? await linkedProfessional(user.id) : null;
  const asked = query.profissional && UUID.test(query.profissional) ? query.profissional : "";
  const professionalId = own ?? (asked || null);
  const [rows, roster] = await Promise.all([
    (user.role === "profissional" && !own) || tooLong ? Promise.resolve([]) : commissionBook(user.accountId, start, end, professionalId),
    operator ? listProfessionals(user.accountId) : Promise.resolve([]),
  ]);
  const people = peopleOf(rows);
  const commission = people.reduce((sum, person) => sum + person.commissionCents, 0);
  const referral = people.reduce((sum, person) => sum + person.referralCents, 0);
  const abatement = people.reduce((sum, person) => sum + person.abatementCents, 0);
  const fee = people.reduce((sum, person) => sum + person.feeCents, 0);
  const week = weekBounds(today);
  const month = monthBounds(today);
  const selected = own ?? asked;

  return (
    <Panel user={user} current="/comissao" title={own ? "Minha comissão" : "Comissão"}>
      <p>O valor nasce na linha. Este período só soma. Execução e venda do pacote ficam na comissão. Indicação entra por cima. Abate é consumo e serviço recebido. A metade da taxa do cartão sai à parte e não mexe no percentual.</p>
      <form className="row" action="/comissao">
        <label>
          De
          <input name="de" type="date" defaultValue={start} required />
        </label>
        <label>
          Até
          <input name="ate" type="date" defaultValue={end} required />
        </label>
        {operator ? (
          <label>
            Pessoa
            <select name="profissional" defaultValue={asked}>
              <option value="">Todas</option>
              {roster.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.nickname || person.name}
                  {person.active ? "" : " · inativo"}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button className="btn" type="submit">
          Ver período
        </button>
      </form>
      <div className="row">
        <Link className="btn quiet" href={periodHref(today, today, selected)}>
          Hoje
        </Link>
        <Link className="btn quiet" href={periodHref(week.start, week.end, selected)}>
          Esta semana
        </Link>
        <Link className="btn quiet" href={periodHref(month.start, month.end, selected)}>
          Este mês
        </Link>
      </div>
      {user.role === "profissional" && !own ? <p>Este acesso ainda não está ligado a um profissional.</p> : null}
      {tooLong ? <p className="error">O período fica em até {SPAN} dias.</p> : null}
      {!tooLong && (own || operator) ? (
        <>
          <div className="tiles">
            <div className="stat">
              <strong>{formatReais(commission)}</strong>
              <span>Comissão</span>
            </div>
            <div className="stat">
              <strong>{formatReais(referral)}</strong>
              <span>Indicação</span>
            </div>
            <div className="stat">
              <strong>{formatReais(abatement)}</strong>
              <span>Abate</span>
            </div>
            <div className="stat">
              <strong>{formatReais(fee)}</strong>
              <span>Metade da taxa</span>
            </div>
            <div className="stat">
              <strong>{formatReais(commission + referral - abatement - fee)}</strong>
              <span>Líquido</span>
            </div>
          </div>
          <div className="card">
            <h2>Por pessoa</h2>
            <p>
              {formatDay(start)} a {formatDay(end)}.
            </p>
            {people.length === 0 ? <p>Nenhuma linha neste período.</p> : null}
            {people.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Comissão</th>
                    <th>Indicação</th>
                    <th>Abate</th>
                    <th>Taxa</th>
                    <th>Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person) => (
                    <tr key={person.id}>
                      <td>{person.name}</td>
                      <td>{formatReais(person.commissionCents)}</td>
                      <td>{formatReais(person.referralCents)}</td>
                      <td>{formatReais(person.abatementCents)}</td>
                      <td>{formatReais(person.feeCents)}</td>
                      <td>{formatReais(person.commissionCents + person.referralCents - person.abatementCents - person.feeCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </div>
          <div className="card">
            <h2>Linhas</h2>
            {rows.length === 0 ? <p>Nada para detalhar.</p> : null}
            {rows.length > 0 ? (
              <table>
                <thead>
                  <tr>
                    <th>Dia</th>
                    <th>Pessoa</th>
                    <th>Origem</th>
                    <th>Linha</th>
                    <th>Comissão</th>
                    <th>Abate</th>
                    <th>Taxa</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.orderId}-${row.origin}-${row.personId}-${index}`}>
                      <td>{formatDay(row.day)}</td>
                      <td>{row.personName}</td>
                      <td>{ORIGIN[row.origin] ?? row.origin}</td>
                      <td>
                        {row.description}
                        {row.clientName ? ` · ${row.clientName}` : ""}
                      </td>
                      <td>{formatReais(row.commissionCents)}</td>
                      <td>{formatReais(row.abatementCents)}</td>
                      <td>{formatReais(row.feeCents)}</td>
                      <td>
                        <Link href={`/comandas/${row.orderId}`}>Comanda</Link>
                      </td>
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
