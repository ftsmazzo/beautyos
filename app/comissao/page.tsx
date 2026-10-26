import Link from "next/link";
import { requireDesk } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { getProfessional, houseRules, listProfessionals } from "@/catalog/queries";
import { dayParam, daysBetween, monthBounds, weekBounds } from "@/desk/clock";
import { extrasBook, linkedProfessional, workStatement, type WorkLine } from "@/desk/queries";
import { paymentMethodLabel } from "@/desk/statuses";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SPAN = 92;

const ACTION: Record<string, string> = {
  comissao: "Comissão",
  venda: "Venda de pacote",
  indicacao: "Indicação",
  taxa: "Taxa de cartão",
  consumo: "Consumo",
  servico_feito: "Serviço em colega",
  servico_recebido: "Serviço recebido",
};

function moneyDetail(row: WorkLine) {
  if (row.action === "taxa") {
    return [row.who, paymentMethodLabel(row.method), row.machine, `taxa da máquina ${formatReais(row.feeCents)}`]
      .filter(Boolean)
      .join(" · ");
  }
  if (row.action === "consumo") {
    return row.listCents > 0 ? `preço de venda ${formatReais(row.listCents)}` : "";
  }
  if (row.action === "servico_feito" || row.action === "servico_recebido") {
    const who = row.action === "servico_feito" ? `para ${row.who}` : `com ${row.who}`;
    const price = `tabela ${formatReais(row.listCents)}`;
    const discount = row.baseCents !== row.listCents ? `com desconto ${formatReais(row.baseCents)}` : "";
    return [who, price, discount].filter(Boolean).join(" · ");
  }
  return row.who;
}

function WorkStatement({
  name,
  start,
  end,
  lines,
}: {
  name: string;
  start: string;
  end: string;
  lines: WorkLine[];
}) {
  const entered = lines.reduce((sum, row) => sum + row.inCents, 0);
  const left = lines.reduce((sum, row) => sum + row.outCents, 0);
  const days: { day: string; rows: WorkLine[] }[] = [];
  for (const row of lines) {
    const last = days[days.length - 1];
    if (last && last.day === row.day) last.rows.push(row);
    else days.push({ day: row.day, rows: [row] });
  }
  const period = start === end ? formatDay(start) : `${formatDay(start)} – ${formatDay(end)}`;

  return (
    <div className="statement-sheet">
      <header className="statement-head">
        <h2>{name}</h2>
        <p>{period}</p>
      </header>
      <div className="statement-totals">
        <div className="statement-total">
          <span className="label">Entrou</span>
          <strong>{formatReais(entered)}</strong>
        </div>
        <div className="statement-total out">
          <span className="label">Saiu</span>
          <strong>{formatReais(left)}</strong>
        </div>
        <div className="statement-total net">
          <span className="label">Líquido</span>
          <strong>{formatReais(entered - left)}</strong>
        </div>
      </div>
      {lines.length === 0 ? (
        <div className="queue">
          <p className="queue-empty">Nada neste período.</p>
        </div>
      ) : null}
      {days.map((group) => {
        const dayIn = group.rows.reduce((sum, row) => sum + row.inCents, 0);
        const dayOut = group.rows.reduce((sum, row) => sum + row.outCents, 0);
        return (
          <div className="queue statement-day" key={group.day} style={{ overflowX: "auto" }}>
            <div className="queue-head">
              <h2>{formatDay(group.day)}</h2>
              <span className="meta">líquido {formatReais(dayIn - dayOut)}</span>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Ação</th>
                  <th>O quê</th>
                  <th className="num">Entrou</th>
                  <th className="num">Saiu</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {group.rows.map((row) => (
                  <tr key={`${row.id}-${row.action}`}>
                    <td>{row.at}</td>
                    <td className="action">{ACTION[row.action] ?? row.action}</td>
                    <td>
                      <div className="statement-what">
                        <strong>{row.title}</strong>
                        {moneyDetail(row) ? <span>{moneyDetail(row)}</span> : null}
                      </div>
                    </td>
                    <td className="num in">{row.inCents > 0 ? formatReais(row.inCents) : ""}</td>
                    <td className="num out">{row.outCents > 0 ? formatReais(row.outCents) : ""}</td>
                    <td>
                      <Link href={`/comandas/${row.orderId}`}>Comanda</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function periodHref(start: string, end: string, professional: string) {
  const who = professional ? `&profissional=${professional}` : "";
  return `/comissao?de=${start}&ate=${end}${who}`;
}

function rankWork(rows: WorkLine[], staffIds: Set<string> | null) {
  const map = new Map<string, { id: string; name: string; visits: number; inCents: number; outCents: number }>();
  for (const row of rows) {
    if (staffIds && !staffIds.has(row.personId)) continue;
    const current = map.get(row.personId) ?? {
      id: row.personId,
      name: row.personName,
      visits: 0,
      inCents: 0,
      outCents: 0,
    };
    if (row.action === "comissao" || row.action === "servico_feito") current.visits += 1;
    current.inCents += row.inCents;
    current.outCents += row.outCents;
    map.set(row.personId, current);
  }
  return [...map.values()].sort(
    (a, b) => b.inCents - b.outCents - (a.inCents - a.outCents) || a.name.localeCompare(b.name, "pt-BR"),
  );
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
  const blocked = (user.role === "profissional" && !own) || tooLong;
  const focused = Boolean(professionalId) && !blocked;
  const rules = await houseRules(user.accountId);
  const [house, roster, extras, lines, person] = await Promise.all([
    !focused && !blocked ? workStatement(user.accountId, start, end, null) : Promise.resolve([]),
    operator ? listProfessionals(user.accountId) : Promise.resolve([]),
    operator && rules.extrasLadder && !focused && !blocked
      ? extrasBook(user.accountId, start, end)
      : Promise.resolve([]),
    focused && professionalId ? workStatement(user.accountId, start, end, professionalId) : Promise.resolve([]),
    focused && professionalId ? getProfessional(user.accountId, professionalId) : Promise.resolve(null),
  ]);
  const staffIds = new Set(roster.map((person) => person.id));
  const ranking = rankWork(house, operator ? staffIds : null);
  const entered = ranking.reduce((sum, person) => sum + person.inCents, 0);
  const left = ranking.reduce((sum, person) => sum + person.outCents, 0);
  const week = weekBounds(today);
  const month = monthBounds(today);
  const selected = own ?? asked;

  return (
    <Panel user={user} current="/comissao" title={focused ? "Extrato" : "Comissão"}>
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
        {!blocked && !focused ? (
          <>
            <span className="chip">Entrou {formatReais(entered)}</span>
            <span className="chip warn">Saiu {formatReais(left)}</span>
            <span className="chip ok">Líquido {formatReais(entered - left)}</span>
          </>
        ) : null}
      </form>
      {user.role === "profissional" && !own ? (
        <p className="desk-alert">Este acesso ainda não está ligado a um profissional.</p>
      ) : null}
      {tooLong ? <p className="desk-alert">Período máximo: {SPAN} dias.</p> : null}
      {!blocked && !focused && ranking.length > 0 ? (
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
                    <th>Entrou</th>
                    <th>Saiu</th>
                    <th>Líquido</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((person, index) => (
                <tr key={person.id}>
                  <td>{index + 1}</td>
                  <td><Link href={periodHref(start, end, person.id)}>{person.name}</Link></td>
                  <td>{person.visits}</td>
                  <td>{formatReais(person.inCents)}</td>
                  <td>{formatReais(person.outCents)}</td>
                  <td>{formatReais(person.inCents - person.outCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!blocked && !focused && operator && rules.extrasLadder && extras.length > 0 ? (
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
      {!blocked && !focused && ranking.length === 0 && extras.length === 0 ? (
        <div className="queue">
          <p className="queue-empty">Nada neste período.</p>
        </div>
      ) : null}
      {focused && person ? (
        <WorkStatement
          name={person.nickname || person.name}
          start={start}
          end={end}
          lines={lines}
        />
      ) : null}
      {focused && !person ? <p className="desk-alert">Profissional não encontrado.</p> : null}
      </div>
    </Panel>
  );
}
