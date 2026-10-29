"use client";

import Link from "next/link";
import { useState } from "react";
import { logout } from "@/auth/actions";
import { moduleAllows, type HouseModuleId } from "@/catalog/modules";
import type { SessionUser } from "@/auth/session";
import { SubmitButton } from "@/ui/submit-button";

type NavLink = { href: string; label: string; group: string };

const OPERATION: NavLink[] = [
  { href: "/inicio", label: "Início", group: "Operação" },
  { href: "/agenda", label: "Agenda", group: "Operação" },
  { href: "/comandas", label: "Comandas", group: "Operação" },
  { href: "/espera", label: "Espera", group: "Operação" },
  { href: "/lembretes", label: "Lembretes", group: "Operação" },
  { href: "/caixa", label: "Caixa", group: "Operação" },
  { href: "/comissao", label: "Comissão", group: "Operação" },
  { href: "/relatorios", label: "Relatórios", group: "Operação" },
  { href: "/agente", label: "Conversas", group: "Operação" },
];

const CATALOG: NavLink[] = [
  { href: "/servicos", label: "Serviços", group: "Cadastros" },
  { href: "/profissionais", label: "Profissionais", group: "Cadastros" },
  { href: "/clientes", label: "Clientes", group: "Cadastros" },
  { href: "/aniversariantes", label: "Aniversariantes", group: "Cadastros" },
  { href: "/volta", label: "Volta", group: "Cadastros" },
  { href: "/produtos", label: "Produtos", group: "Cadastros" },
  { href: "/fornecedores", label: "Fornecedores", group: "Cadastros" },
  { href: "/pacotes", label: "Pacotes", group: "Cadastros" },
  { href: "/pacotes/vendidos", label: "Vendidos", group: "Cadastros" },
  { href: "/pacotes/relatorio", label: "Relatório", group: "Cadastros" },
];

const SYSTEM: NavLink[] = [
  { href: "/logs", label: "Logs", group: "Sistema" },
  { href: "/acesso", label: "Acesso", group: "Sistema" },
  { href: "/meu", label: "Minha conta", group: "Conta" },
];

const FINANCE: NavLink[] = [
  { href: "/financeiro", label: "A pagar", group: "Financeiro" },
  { href: "/financeiro/receber", label: "A receber", group: "Financeiro" },
  { href: "/financeiro/bancos", label: "Bancos", group: "Financeiro" },
  { href: "/financeiro/cartoes", label: "Cartões", group: "Financeiro" },
  { href: "/financeiro/plano", label: "Plano", group: "Financeiro" },
  { href: "/financeiro/fluxo", label: "Fluxo", group: "Financeiro" },
];

function NavIcon({ href }: { href: string }) {
  const common = {
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    "aria-hidden": true as const,
  };
  if (href === "/inicio") {
    return (
      <svg {...common}>
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (href === "/agenda") {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </svg>
    );
  }
  if (href === "/espera") {
    return (
      <svg {...common}>
        <path d="M6 7h12v3H6zM6 12h12v3H6zM6 17h8v3H6z" />
      </svg>
    );
  }
  if (href === "/lembretes") {
    return (
      <svg {...common}>
        <path d="M12 4v2M6 9h12v10H6z" />
        <path d="M9 13h6M9 16h4" />
      </svg>
    );
  }
  if (href === "/aniversariantes") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" />
        <path d="M6 19c1-3 3-4.5 6-4.5S17 16 18 19" />
      </svg>
    );
  }
  if (href === "/comandas") {
    return (
      <svg {...common}>
        <path d="M7 4h10v16H7z" />
        <path d="M10 8h4M10 12h4M10 16h2" />
      </svg>
    );
  }
  if (href === "/caixa" || href === "/comissao") {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M3 10h18" />
      </svg>
    );
  }
  if (href === "/logs") {
    return (
      <svg {...common}>
        <path d="M8 6h11M8 12h11M8 18h11" />
        <path d="M4 6h.01M4 12h.01M4 18h.01" />
      </svg>
    );
  }
  if (href === "/servicos") {
    return (
      <svg {...common}>
        <path d="M8 7h8M8 12h8M8 17h5" />
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    );
  }
  if (href === "/profissionais") {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3" />
        <path d="M5 19c1.5-3 3.8-4.5 7-4.5S17.5 16 19 19" />
      </svg>
    );
  }
  if (href === "/volta") {
    return (
      <svg {...common}>
        <path d="M4 12a8 8 0 1 0 2.2-5.5" />
        <path d="M4 4v5h5" />
      </svg>
    );
  }
  if (href === "/clientes") {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="2.5" />
        <circle cx="16" cy="9" r="2" />
        <path d="M4.5 18c.8-2.4 2.4-3.5 4.5-3.5s3.7 1.1 4.5 3.5M14 14.5c1.6 0 3 .7 3.8 2.5" />
      </svg>
    );
  }
  if (href === "/produtos" || href === "/fornecedores") {
    return (
      <svg {...common}>
        <path d="M3 8l9-4 9 4-9 4-9-4z" />
        <path d="M3 8v8l9 4 9-4V8" />
        <path d="M12 12v8" />
      </svg>
    );
  }
  if (href === "/pacotes" || href === "/pacotes/vendidos") {
    return (
      <svg {...common}>
        <path d="M8 7h11v12H8z" />
        <path d="M5 4h11v3" />
      </svg>
    );
  }
  if (href === "/pacotes/relatorio" || href === "/relatorios") {
    return (
      <svg {...common}>
        <path d="M5 19V10M12 19V5M19 19v-7" />
      </svg>
    );
  }
  if (href.startsWith("/financeiro")) {
    return (
      <svg {...common}>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M7 11h4M7 15h10" />
      </svg>
    );
  }
  if (href === "/agente") {
    return (
      <svg {...common}>
        <path d="M4 6h16v10H8l-4 3z" />
        <path d="M8 10h8M8 13h5" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="6" y="10" width="12" height="9" rx="1.5" />
      <path d="M8 10V8a4 4 0 0 1 8 0v2" />
    </svg>
  );
}

const ROLE_LABEL: Record<string, string> = {
  balcao: "Balcão",
  administrador: "Administrador",
  profissional: "Profissional",
  cliente: "Cliente",
};

export function PanelFrame({
  user,
  current,
  title,
  modules,
  children,
}: {
  user: SessionUser;
  current: string;
  title: string;
  modules: Record<HouseModuleId, boolean>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const operator = user.role === "administrador" || user.role === "balcao";
  const links: NavLink[] = (
    operator
      ? [
          ...OPERATION,
          ...CATALOG,
          ...(user.role === "administrador" && modules.financeiro
            ? FINANCE
            : user.role === "balcao" && modules.financeiro
              ? FINANCE.filter((link) => link.href === "/financeiro/receber")
              : []),
          ...SYSTEM.filter((l) => l.href === "/logs"),
        ]
      : user.role === "profissional"
        ? OPERATION.filter((l) =>
            ["/inicio", "/agenda", "/comandas", "/espera", "/lembretes", "/comissao"].includes(l.href),
          )
        : [
            { href: "/inicio", label: "Início", group: "Conta" },
            ...SYSTEM.filter((l) => l.href === "/meu"),
          ]
  ).filter((link) => moduleAllows(modules, link.href));
  if (user.role === "administrador") {
    links.push(...SYSTEM.filter((l) => l.href === "/acesso"));
  }

  const groups: { name: string; items: NavLink[] }[] = [];
  for (const link of links) {
    const last = groups[groups.length - 1];
    if (last && last.name === link.group) last.items.push(link);
    else groups.push({ name: link.group, items: [link] });
  }

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="page">
      <aside
        className={`navbar navbar-vertical navbar-expand-lg navbar-dark${open ? " show" : ""}`}
        data-bs-theme="dark"
      >
        <div className="container-fluid">
          <button
            type="button"
            className="navbar-toggler"
            aria-label="Abrir menu"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="navbar-toggler-icon" />
          </button>
          <h1 className="navbar-brand navbar-brand-autodark">
            <Link href="/inicio" onClick={() => setOpen(false)}>
              <span className="avatar avatar-sm bg-primary text-white me-2 rounded" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 4h12v4H6zM8 8v12M16 8v12M10 14h4" />
                </svg>
              </span>
              <span>
                BeautyOS
                <span className="d-block text-secondary small fw-normal">{user.accountName}</span>
              </span>
            </Link>
          </h1>
          <div className={`collapse navbar-collapse${open ? " show" : ""}`} id="sidebar-menu">
            <ul className="navbar-nav pt-lg-3">
              {groups.map((group) => (
                <li key={group.name} className="nav-item pt-2">
                  <span className="nav-link nav-link-group disabled">{group.name}</span>
                  {group.items.map((link) => (
                    <Link
                      key={link.href}
                      className={`nav-link${current === link.href ? " active" : ""}`}
                      href={link.href}
                      aria-current={current === link.href ? "page" : undefined}
                      onClick={() => setOpen(false)}
                    >
                      <span className="nav-link-icon">
                        <NavIcon href={link.href} />
                      </span>
                      <span className="nav-link-title">{link.label}</span>
                    </Link>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
      {open ? (
        <button type="button" className="scrim" aria-label="Fechar menu" onClick={() => setOpen(false)} />
      ) : null}
      <div className="page-wrapper">
        <div className="page-header d-print-none">
          <div className="container-xl">
            <div className="row g-2 align-items-center">
              <div className="col">
                <div className="page-pretitle">Painel</div>
                <h2 className="page-title">{title}</h2>
              </div>
              <div className="col-auto ms-auto d-print-none">
                <div className="d-flex align-items-center gap-3">
                  <div className="d-none d-md-flex align-items-center">
                    <span className="avatar avatar-sm avatar-icon me-2" aria-hidden="true" title={initials}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="12" cy="8" r="3.2" />
                        <path d="M5 19c1.4-3.2 3.8-4.8 7-4.8s5.6 1.6 7 4.8" />
                      </svg>
                    </span>
                    <div className="lh-sm">
                      <div className="fw-medium">{user.name}</div>
                      <div className="text-secondary small">{ROLE_LABEL[user.role] ?? user.role}</div>
                    </div>
                  </div>
                  <form action={logout}>
                    <SubmitButton label="Sair" pendingLabel="Saindo…" className="quiet" />
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
        <main className="page-body">
          <div className={`container-xl content${current === "/agenda" ? " content-wide" : ""}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
