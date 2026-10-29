"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { logout } from "@/auth/actions";
import { moduleAllows, type HouseModuleId } from "@/catalog/modules";
import type { SessionUser } from "@/auth/session";
import { SubmitButton } from "@/ui/submit-button";

type VisualTheme = "salon" | "barber";
const THEME_KEY = "beautyos-theme";

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

const ROLE_LABEL: Record<string, string> = {
  balcao: "Balcão",
  administrador: "Administrador",
  profissional: "Profissional",
  cliente: "Cliente",
};

function clockNow() {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date());
  } catch {
    return "";
  }
}

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
  const [theme, setTheme] = useState<VisualTheme>("salon");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_KEY);
    const next: VisualTheme = saved === "barber" ? "barber" : "salon";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    setClock(clockNow());
    const id = window.setInterval(() => setClock(clockNow()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  function toggleTheme() {
    const next: VisualTheme = theme === "salon" ? "barber" : "salon";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    window.localStorage.setItem(THEME_KEY, next);
  }

  const operator = user.role === "administrador" || user.role === "balcao";
  const links: NavLink[] = (operator
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

  const primary = links.filter((l) => l.group === "Operação");
  const secondary = links.filter((l) => l.group !== "Operação");

  const groups: { name: string; items: NavLink[] }[] = [];
  for (const link of secondary) {
    const last = groups[groups.length - 1];
    if (last && last.name === link.group) last.items.push(link);
    else groups.push({ name: link.group, items: [link] });
  }

  return (
    <div className={`station ${open ? "is-open" : ""}`} data-shell={theme}>
      <aside className="station-rail" aria-label="Navegação">
        <div className="station-brand">
          <p className="station-wordmark">BeautyOS</p>
          <p className="station-house">{user.accountName}</p>
        </div>

        <button
          type="button"
          className="station-theme"
          onClick={toggleTheme}
          aria-pressed={theme === "barber"}
        >
          <span className="station-theme-a">A salão</span>
          <span className="station-theme-b">B barbeiro</span>
        </button>

        <nav className="station-ops">
          {primary.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="station-op"
              aria-current={current === link.href ? "page" : undefined}
              onClick={() => setOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {groups.length > 0 ? (
          <div className="station-more">
            {groups.map((group) => (
              <details key={group.name} className="station-fold" open={group.items.some((i) => i.href === current)}>
                <summary>{group.name}</summary>
                <div className="station-fold-list">
                  {group.items.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="station-op is-sub"
                      aria-current={current === link.href ? "page" : undefined}
                      onClick={() => setOpen(false)}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </aside>

      {open ? (
        <button type="button" className="station-scrim" aria-label="Fechar menu" onClick={() => setOpen(false)} />
      ) : null}

      <div className="station-stage">
        <header className="station-mast">
          <button type="button" className="station-menu" onClick={() => setOpen(true)}>
            Menu
          </button>
          <div className="station-mast-title">
            <h1>{title}</h1>
            {clock ? <time className="station-clock">{clock}</time> : null}
          </div>
          <div className="station-who">
            <strong>{user.name}</strong>
            <span>{ROLE_LABEL[user.role] ?? user.role}</span>
          </div>
          <form action={logout} className="station-logout">
            <SubmitButton label="Sair" pendingLabel="…" className="quiet" />
          </form>
        </header>
        <main className="station-work content">{children}</main>
      </div>
    </div>
  );
}
