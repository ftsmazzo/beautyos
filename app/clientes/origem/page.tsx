import Link from "next/link";
import { requireOperator } from "@/catalog/access";
import { formatPhone } from "@/catalog/format";
import { CHANNELS, channelLabel } from "@/catalog/labels";
import { channelBook } from "@/catalog/queries";
import { Panel } from "@/ui/panel";

export const dynamic = "force-dynamic";

const KNOWN = new Set<string>(CHANNELS.map((item) => item.value));

export default async function OriginPage({
  searchParams,
}: {
  searchParams: Promise<{ canal?: string }>;
}) {
  const user = await requireOperator();
  const query = await searchParams;
  const channel = query.canal && KNOWN.has(query.canal) ? query.canal : "";
  const people = await channelBook(user.accountId);
  const counts = CHANNELS.map((item) => ({
    ...item,
    qty: people.filter((person) => person.channel === item.value).length,
  }));
  const visible = channel ? people.filter((person) => person.channel === channel) : people;

  return (
    <Panel user={user} current="/clientes" title="Origem">
      <div className="desk">
      <div className="desk-bar">
        <Link className="btn quiet" href="/clientes">
          Clientes
        </Link>
        <Link className={channel === "" ? "btn" : "btn quiet"} href="/clientes/origem">
          Todos · {people.length}
        </Link>
        {counts.map((item) => (
          <Link
            key={item.value}
            className={channel === item.value ? "btn" : "btn quiet"}
            href={`/clientes/origem?canal=${item.value}`}
          >
            {item.label} · {item.qty}
          </Link>
        ))}
      </div>
      <div className="queue" style={{ overflowX: "auto" }}>
        {visible.length === 0 ? <p className="queue-empty">Ninguém neste canal.</p> : null}
        {visible.length > 0 ? (
          <table className="sheet">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Celular</th>
                <th>Canal</th>
                <th>Quem trouxe</th>
                <th>Marcas</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((person) => (
                <tr key={person.id}>
                  <td data-label="Nome">{person.name}</td>
                  <td data-label="Celular">{formatPhone(person.phone)}</td>
                  <td data-label="Canal">{channelLabel(person.channel)}</td>
                  <td data-label="Quem trouxe">{person.channel === "indicacao" ? person.broughtBy ?? "—" : "—"}</td>
                  <td data-label="Marcas">
                    {[person.fromOutside ? "de fora" : "", person.incomplete ? "incompleto" : ""].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td>
                    <Link href={`/clientes/${person.id}`}>Abrir</Link>
                  </td>
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
