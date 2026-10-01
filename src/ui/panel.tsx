import Link from "next/link";
import { logout } from "@/auth/actions";
import type { SessionUser } from "@/auth/session";
import { SubmitButton } from "@/ui/submit-button";

const LINKS = [
  { href: "/inicio", label: "Início" },
  { href: "/servicos", label: "Serviços" },
  { href: "/profissionais", label: "Profissionais" },
  { href: "/clientes", label: "Clientes" },
  { href: "/produtos", label: "Produtos" },
  { href: "/pacotes", label: "Pacotes" },
];

export function Panel({
  user,
  current,
  title,
  children,
}: {
  user: SessionUser;
  current: string;
  title: string;
  children: React.ReactNode;
}) {
  const operator = user.role === "administrador" || user.role === "balcao";
  const links = operator ? LINKS : LINKS.filter((link) => link.href === "/inicio");
  return (
    <main className="wide">
      <header className="top">
        <strong>{user.accountName}</strong>
        <nav>
          {links.map((link) => (
            <Link key={link.href} href={link.href} aria-current={current === link.href ? "page" : undefined}>
              {link.label}
            </Link>
          ))}
          {user.role === "administrador" ? (
            <Link href="/acesso" aria-current={current === "/acesso" ? "page" : undefined}>
              Acesso
            </Link>
          ) : null}
        </nav>
        <form action={logout}>
          <SubmitButton label="Sair" pendingLabel="Saindo…" className="ghost" />
        </form>
      </header>
      <h1>{title}</h1>
      {children}
    </main>
  );
}
