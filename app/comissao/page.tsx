import Link from "next/link";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { houseRules, listProfessionals } from "@/catalog/queries";
import { dayParam, daysBetween, monthBounds, weekBounds } from "@/desk/clock";
import { commissionBook, extrasBook, linkedProfessional, rankNet, rankStaff, type CommissionLine } from "@/desk/queries";
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
  const rules = await houseRules(user.accountId);
  const [rows, roster, extras] = await Promise.all([
    (user.role === "profissional" && !own) || tooLong ? Promise.resolve([]) : commissionBook(user.accountId, start, end, professionalId),
    operator ? listProfessionals(user.accountId) : Promise.resolve([]),
    operator && rules.extrasLadder && !tooLong
      ? extrasBook(user.accountId, start, end)
      : Promise.resolve([]),
  ]);
  const people = peopleOf(rows);
  const staffIds = new Set(roster.map((person) => person.id));
  const ranking = rankStaff(rows, operator ? staffIds : null);
  const commission = people.reduce((sum, person) => sum + person.commissionCents, 0);
  const referral = people.reduce((sum, person) => sum + person.referralCents, 0);
  const abatement = people.reduce((sum, person) => sum + person.abatementCents, 0);
  const fee = people.reduce((sum, person) => sum + person.feeCents, 0);
  const week = weekBounds(today);
  const month = monthBounds(today);
  const selected = own ?? asked;

  return (
    <Panel user={user} current="/comissao" title={own ? "Minha comissão" : "Comissão"}>
      <div className="desk">
      <form className="desk-bar" action="/comissao">
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
          Ver
        </button>
        <Link className="btn quiet" href={periodHref(today, today, selected)}>
          Hoje
        </Link>
        <Link className="btn quiet" href={periodHref(week.start, week.end, selected)}>
          Semana
        </Link>
        <Link className="btn quiet" href={periodHref(month.start, month.end, selected)}>
          Mês
        </Link>
        {!tooLong && (own || operator) ? (
          <>
            <span className="chip">Comissão {formatReais(commission)}</span>
            <span className="chip">Indicação {formatReais(referral)}</span>
            <span className="chip warn">Abate {formatReais(abatement)}</span>
            <span className="chip">Taxa {formatReais(fee)}</span>
            <span className="chip ok">Líquido {formatReais(commission + referral - abatement - fee)}</span>
          </>
        ) : null}
      </form>
      {user.role === "profissional" && !own ? (
        <p className="desk-alert">Este acesso ainda não está ligado a um profissional.</p>
      ) : null}
      {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
      {!tooLong && (own || operator) ? (
        <>
          {ranking.length > 0 ? (
            <div className="queue" style={{ overflowX: "auto" }}>
              <div className="queue-head">
                <h2>Ranking</h2>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Pessoa</th>
                    <th>Atend.</th>
                    <th>Comissão</th>
                    <th>Indicação</th>
                    <th>Abate</th>
                    <th>Taxa</th>
                    <th>Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((person, index) => (
                    <tr key={person.id}>
                      <td>{index + 1}</td>
                      <td>{person.name}</td>
                      <td>{person.visits}</td>
                      <td>{formatReais(person.commissionCents)}</td>
                      <td>{formatReais(person.referralCents)}</td>
                      <td>{formatReais(person.abatementCents)}</td>
                      <td>{formatReais(person.feeCents)}</td>
                      <td>{formatReais(rankNet(person))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {operator && rules.extrasLadder && extras.length > 0 ? (
            <div className="queue">
              <div className="queue-head">
                <h2>Extras</h2>
              </div>
              {extras.map((person, index) => (
                <div className="queue-row" key={person.id}>
                  <strong>#{index + 1}</strong>
                  <span>{person.name}</span>
                  <span>{person.visits}</span>
                  <span>{formatReais(person.cents)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div className="queue" style={{ overflowX: "auto" }}>
            <div className="queue-head">
              <h2>Linhas</h2>
              <span className="meta">{rows.length}</span>
            </div>
            {rows.length === 0 ? <p className="queue-empty">Nada neste período.</p> : null}
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
      </div>
    </Panel>
  );
}
