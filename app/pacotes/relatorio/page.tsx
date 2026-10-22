import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatDay, formatReais, packageGap, todaySaoPaulo } from "@/catalog/format";
import { shiftDay } from "@/desk/clock";
import { packageReport } from "@/desk/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

function monthBounds(day: string) {
  const start = `${day.slice(0, 8)}01`;
  const [year, month] = start.split("-").map(Number);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { start, end: shiftDay(next, -1) };
}

function dayOrNull(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export default async function PackageReportPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const today = todaySaoPaulo();
  const current = monthBounds(today);
  const previous = monthBounds(shiftDay(current.start, -1));
  const from = dayOrNull(query.de) ?? current.start;
  const to = dayOrNull(query.ate) ?? current.end;
  const start = from <= to ? from : to;
  const end = from <= to ? to : from;
  const report = await packageReport(user.accountId, start, end);
  const soldCents = report.sales.reduce((sum, row) => sum + row.soldCents, 0);
  const avulsoCents = report.sales.reduce((sum, row) => sum + row.avulsoCents, 0);
  const soldCount = report.sales.reduce((sum, row) => sum + row.sales, 0);
  const weekWord = report.pardons.weeks === 1 ? "semana perdida" : "semanas perdidas";

  return (
    <Panel user={user} current="/pacotes/relatorio" title="Relatório de pacotes">
      <div className="desk">
      <div className="desk-bar">
        <form className="filters" action="/pacotes/relatorio">
          <input type="date" name="de" defaultValue={start} required aria-label="De" />
          <input type="date" name="ate" defaultValue={end} required aria-label="Até" />
          <button className="btn" type="submit">Ver</button>
        </form>
        <Link className="btn quiet" href={`/pacotes/relatorio?de=${current.start}&ate=${current.end}`}>
          Este mês
        </Link>
        <Link className="btn quiet" href={`/pacotes/relatorio?de=${previous.start}&ate=${previous.end}`}>
          Mês passado
        </Link>
        <Link className="btn quiet" href="/pacotes/vendidos">
          Vendidos
        </Link>
        <span className="chip">{formatDay(start)} – {formatDay(end)}</span>
      </div>
      <div className="tiles">
        <div className="stat">
          <strong>{soldCount}</strong>
          <span>{soldCount === 1 ? "Pacote vendido" : "Pacotes vendidos"}</span>
        </div>
        <div className="stat">
          <strong>{formatReais(soldCents)}</strong>
          <span>Valor vendido</span>
        </div>
        <div className="stat">
          <strong>{formatReais(Math.abs(avulsoCents - soldCents))}</strong>
          <span>{avulsoCents >= soldCents ? "Abaixo do avulso" : "Acima do avulso"}</span>
        </div>
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="desk-bar"><span className="day-label">Quais vendem</span></div>
        {report.sales.length === 0 ? <p className="queue-empty">Nenhum pacote vendido neste período.</p> : null}
        {report.sales.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Pacote</th>
                <th>Vendas</th>
                <th>Valor</th>
                <th>Avulso</th>
                <th>Diferença</th>
              </tr>
            </thead>
            <tbody>
              {report.sales.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.sales}</td>
                  <td>{formatReais(row.soldCents)}</td>
                  <td>{formatReais(row.avulsoCents)}</td>
                  <td>{packageGap(row.avulsoCents, row.soldCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="desk-bar"><span className="day-label">Serviços</span></div>
        {report.services.length === 0 ? <p className="queue-empty">Nenhum serviço neste período.</p> : null}
        {report.services.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Serviço</th>
                <th>Idas</th>
                <th>Interno</th>
                <th>Avulso</th>
                <th>Diferença</th>
              </tr>
            </thead>
            <tbody>
              {report.services.map((row) => (
                <tr key={row.name}>
                  <td>{row.name}</td>
                  <td>{row.visits}</td>
                  <td>{formatReais(row.internalCents)}</td>
                  <td>{formatReais(row.avulsoCents)}</td>
                  <td>{packageGap(row.avulsoCents, row.internalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        <div className="desk-bar"><span className="day-label">Perdões</span></div>
        {report.pardons.times === 0 ? <p className="queue-empty">Nenhum perdão neste período.</p> : null}
        {report.pardons.times > 0 ? (
          <div className="desk-bar">
            <span className="chip">{report.pardons.times} {report.pardons.times === 1 ? "vez" : "vezes"}</span>
            <span className="chip">{report.pardons.weeks} {weekWord}</span>
            <span className="chip">{report.pardons.clients} {report.pardons.clients === 1 ? "cliente" : "clientes"}</span>
          </div>
        ) : null}
        {report.pardons.times > 0 && report.repeats.length === 0 ? <p className="queue-empty">Ninguém repetiu o perdão neste período.</p> : null}
        {report.repeats.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>No período</th>
                <th>Semanas</th>
              </tr>
            </thead>
            <tbody>
              {report.repeats.map((row) => (
                <tr key={row.clientId}>
                  <td>
                    {row.clientName}
                    {row.sequence > row.times ? ` · já é a ${row.sequence}ª` : ""}
                  </td>
                  <td>{row.times === 1 ? "1 vez" : `${row.times} vezes`}</td>
                  <td>{row.weeks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>
      </div>
    </Panel>
  );
}
