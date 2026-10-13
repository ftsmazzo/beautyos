import Link from "next/link";

const LINKS = [
  { id: "pagar", href: "/financeiro", label: "A pagar" },
  { id: "receber", href: "/financeiro/receber", label: "A receber" },
  { id: "bancos", href: "/financeiro/bancos", label: "Bancos" },
  { id: "cartoes", href: "/financeiro/cartoes", label: "Cartões" },
] as const;

export function FinanceNav({ current }: { current: (typeof LINKS)[number]["id"] }) {
  return (
    <div className="row">
      {LINKS.map((link) => (
        <Link key={link.id} className={link.id === current ? "btn" : "btn quiet"} href={link.href}>
          {link.label}
        </Link>
      ))}
    </div>
  );
}
