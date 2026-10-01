"use client";

import Link from "next/link";
import { useState } from "react";
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

function NavIcon({ href }: { href: string }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, "aria-hidden": true as const };
  if (href === "/inicio") {
    return <svg {...common}><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" /></svg>;
  }
  if (href === "/servicos") {
    return <svg {...common}><path d="M8 7h8M8 12h8M8 17h5" /><rect x="4" y="4" width="16" height="16" rx="2" /></svg>;
  }
  if (href === "/profissionais") {
    return <svg {...common}><circle cx="12" cy="8" r="3" /><path d="M5 19c1.5-3 3.8-4.5 7-4.5S17.5 16 19 19" /></svg>;
  }
  if (href === "/clientes") {
    return <svg {...common}><circle cx="9" cy="8" r="2.5" /><circle cx="16" cy="9" r="2" /><path d="M4.5 18c.8-2.4 2.4-3.5 4.5-3.5s3.7 1.1 4.5 3.5M14 14.5c1.6 0 3 .7 3.8 2.5" /></svg>;
  }
  if (href === "/produtos") {
    return <svg {...common}><path d="M3 8l9-4 9 4-9 4-9-4z" /><path d="M3 8v8l9 4 9-4V8" /><path d="M12 12v8" /></svg>;
  }
  if (href === "/pacotes") {
    return <svg {...common}><path d="M8 7h11v12H8z" /><path d="M5 4h11v3" /></svg>;
  }
  return <svg {...common}><rect x="6" y="10" width="12" height="9" rx="1.5" /><path d="M8 10V8a4 4 0 0 1 8 0v2" /></svg>;
}

const ROLE_LABEL: Record<string, string> = {
  balcao: "Balcão",
  administrador: "Administrador",
  profissional: "Profissional",
  cliente: "Cliente",
};

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
  const [open, setOpen] = useState(false);
  const operator = user.role === "administrador" || user.role === "balcao";
  const links = (operator ? LINKS : LINKS.filter((link) => link.href === "/inicio")).slice();
  if (user.role === "administrador") links.push({ href: "/acesso", label: "Acesso" });

  return (
    <div className="app">
      <aside className={open ? "side open" : "side"}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          <div>
            <strong>BeautyOS</strong>
            <small>{user.accountName}</small>
          </div>
        </div>
        <nav>
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={current === link.href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              <NavIcon href={link.href} />
              {link.label}
            </Link>
          ))}
        </nav>
      </aside>
      {open ? (
        <button type="button" className="scrim" aria-label="Fechar menu" onClick={() => setOpen(false)} />
      ) : null}
      <div className="workspace">
        <header className="topbar">
          <button type="button" className="btn quiet menu-btn" onClick={() => setOpen(true)}>
            Menu
          </button>
          <h1>{title}</h1>
          <div className="who">
            <strong>{user.name}</strong>
            <span>{ROLE_LABEL[user.role] ?? user.role}</span>
          </div>
          <form action={logout}>
            <SubmitButton label="Sair" pendingLabel="Saindo…" className="quiet" />
          </form>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
