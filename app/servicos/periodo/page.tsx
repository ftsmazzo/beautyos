import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatReais, todaySaoPaulo } from "@/catalog/format";
import { dayParam, daysBetween, monthBounds, weekBounds } from "@/desk/clock";
import { serviceSplit } from "@/desk/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const SPAN = 92;

function href(start: string, end: string) {
  return `/servicos/periodo?de=${start}&ate=${end}`;
}

export default async function ServicePeriodPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const today = todaySaoPaulo();
  let start = dayParam(query.de ?? monthBounds(today).start);
  let end = dayParam(query.ate ?? today);
  if (start > end) [start, end] = [end, start];
  const tooLong = daysBetween(start, end) > SPAN;
  const rows = tooLong ? [] : await serviceSplit(user.accountId, start, end);
  const week = weekBounds(today);
  const month = monthBounds(today);

  return (
    <Panel user={user} current="/servicos" title="Venda, uso e avulso">
      <div className="row">
        <Link className="btn quiet" href="/servicos">
          Serviços
        </Link>
      </div>
      <p>
        O serviço continua um só. Venda é a ida que entrou no pacote, pelo preço interno. Uso é essa ida quando acontece, de novo pelo interno. Avulso é o que foi cobrado fora do pacote. Cortesia conta no avulso e o valor cobrado fica zero.
      </p>
      <form className="row" action="/servicos/periodo">
        <label>
          De
          <input name="de" type="date" defaultValue={start} required />
        </label>
        <label>
          Até
          <input name="ate" type="date" defaultValue={end} required />
        </label>
        <button className="btn" type="submit">
          Ver período
        </button>
      </form>
      <div className="row">
        <Link className="btn quiet" href={href(week.start, today < week.end ? today : week.end)}>
          Esta semana
        </Link>
        <Link className="btn quiet" href={href(month.start, today)}>
          Este mês
        </Link>
        <strong>
          {formatDay(start)} – {formatDay(end)}
        </strong>
      </div>
      {tooLong ? <p className="error">O período fica em até {SPAN} dias.</p> : null}
      <div className="card">
        {!tooLong && rows.length === 0 ? <p>Nenhum serviço neste período.</p> : null}
        {rows.length > 0 ? (
          <table className="sheet">
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Venda</th>
                <th>Uso</th>
                <th>Avulso</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td data-label="Serviço">{row.name}</td>
                  <td data-label="Venda">
                    {row.vendaQty === 0 ? "—" : `${row.vendaQty} · ${formatReais(row.vendaCents)}`}
                  </td>
                  <td data-label="Uso">
                    {row.usoQty === 0 ? "—" : `${row.usoQty} · ${formatReais(row.usoCents)}`}
                  </td>
                  <td data-label="Avulso">
                    {row.avulsoQty === 0
                      ? "—"
                      : `${row.avulsoQty} · ${formatReais(row.avulsoCents)}${row.courtesyQty > 0 ? ` · ${row.courtesyQty} cortesia` : ""}`}
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
