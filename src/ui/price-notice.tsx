import Link from "next/link";
import { formatReais } from "@/catalog/format";
import { seePriceNotices } from "@/catalog/service-actions";
import { SubmitButton } from "@/ui/submit-button";

export function PriceNotice({
  notices,
  back,
}: {
  notices: { id: string; serviceId: string | null; serviceName: string; beforeCents: number; afterCents: number }[];
  back: "inicio" | "servicos";
}) {
  if (notices.length === 0) return null;
  return (
    <div className="card">
      <h2>Preço trocado</h2>
      {notices.map((notice) => (
        <p key={notice.id}>
          {notice.serviceId ? <Link href={`/servicos/${notice.serviceId}`}>{notice.serviceName}</Link> : notice.serviceName}
          {` passou de ${formatReais(notice.beforeCents)} para ${formatReais(notice.afterCents)}.`}
        </p>
      ))}
      <form action={seePriceNotices}>
        <input type="hidden" name="back" value={back} />
        <SubmitButton label="Entendi" pendingLabel="Salvando…" className="quiet" />
      </form>
    </div>
  );
}
