"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { logout } from "@/auth/actions";
import { moduleAllows, type HouseModuleId } from "@/catalog/modules";
import type { SessionUser } from "@/auth/session";
import { SubmitButton } from "@/ui/submit-button";

type VisualTemplate = "salon" | "barber";
const TEMPLATE_KEY = "beautyos-theme";

type NavLink = { href: string; label: string; group: string };

/** Rotas quentes do balcão — sempre visíveis no rail. */
const HOT: NavLink[] = [
  { href: "/inicio", label: "Início", group: "hot" },
  { href: "/agenda", label: "Agenda", group: "hot" },
  { href: "/comandas", label: "Comandas", group: "hot" },
  { href: "/caixa", label: "Caixa", group: "hot" },
  { href: "/produtos", label: "Produtos", group: "hot" },
  { href: "/financeiro/receber", label: "A receber", group: "hot" },
];

const MORE: NavLink[] = [
  { href: "/espera", label: "Espera", group: "Operação" },
  { href: "/lembretes", label: "Lembretes", group: "Operação" },
  { href: "/comissao", label: "Comissão", group: "Operação" },
  { href: "/relatorios", label: "Relatórios", group: "Operação" },
  { href: "/agente", label: "Conversas", group: "Operação" },
  { href: "/servicos", label: "Serviços", group: "Cadastros" },
  { href: "/profissionais", label: "Profissionais", group: "Cadastros" },
  { href: "/clientes", label: "Clientes", group: "Cadastros" },
  { href: "/aniversariantes", label: "Aniversariantes", group: "Cadastros" },
  { href: "/volta", label: "Volta", group: "Cadastros" },
  { href: "/fornecedores", label: "Fornecedores", group: "Cadastros" },
  { href: "/pacotes", label: "Pacotes", group: "Cadastros" },
  { href: "/pacotes/vendidos", label: "Vendidos", group: "Cadastros" },
  { href: "/pacotes/relatorio", label: "Relatório", group: "Cadastros" },
  { href: "/financeiro", label: "A pagar", group: "Financeiro" },
  { href: "/financeiro/bancos", label: "Bancos", group: "Financeiro" },
  { href: "/financeiro/cartoes", label: "Cartões", group: "Financeiro" },
  { href: "/financeiro/plano", label: "Plano", group: "Financeiro" },
  { href: "/financeiro/fluxo", label: "Fluxo", group: "Financeiro" },
  { href: "/logs", label: "Logs", group: "Sistema" },
  { href: "/acesso", label: "Acesso", group: "Sistema" },
  { href: "/meu", label: "Minha conta", group: "Conta" },
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

function applyTemplate(next: VisualTemplate) {
  document.documentElement.setAttribute("data-template", next);
  document.documentElement.setAttribute("data-theme", next);
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
  const [template, setTemplate] = useState<VisualTemplate>("salon");
  const [clock, setClock] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem(TEMPLATE_KEY);
    const next: VisualTemplate = saved === "barber" ? "barber" : "salon";
    setTemplate(next);
    applyTemplate(next);
    setClock(clockNow());
    const id = window.setInterval(() => setClock(clockNow()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  function toggleTemplate() {
    const next: VisualTemplate = template === "salon" ? "barber" : "salon";
    setTemplate(next);
    applyTemplate(next);
    window.localStorage.setItem(TEMPLATE_KEY, next);
  }

  const operator = user.role === "administrador" || user.role === "balcao";
  const allow = (href: string) => moduleAllows(modules, href);

  let hot = HOT.filter((l) => allow(l.href));
  let more = MORE.filter((l) => allow(l.href));

  if (user.role === "balcao") {
    more = more.filter((l) => !l.href.startsWith("/financeiro") || l.href === "/financeiro/receber");
    more = more.filter((l) => l.href !== "/acesso");
  } else if (user.role === "profissional") {
    const ok = new Set(["/inicio", "/agenda", "/comandas", "/espera", "/lembretes", "/comissao"]);
    hot = hot.filter((l) => ok.has(l.href));
    more = more.filter((l) => ok.has(l.href));
  } else if (user.role === "cliente") {
    hot = [{ href: "/inicio", label: "Início", group: "hot" }];
    more = MORE.filter((l) => l.href === "/meu");
  }

  if (!operator) {
    hot = hot.filter((l) => l.href !== "/financeiro/receber" && l.href !== "/produtos" && l.href !== "/caixa");
  }

  if (user.role !== "administrador") {
    more = more.filter((l) => l.href !== "/acesso");
  }

  const groups: { name: string; items: NavLink[] }[] = [];
  for (const link of more) {
    const last = groups[groups.length - 1];
    if (last && last.name === link.group) last.items.push(link);
    else groups.push({ name: link.group, items: [link] });
  }

  const mirrorLinks = [
    { href: "/caixa", label: "Caixa do dia" },
    { href: "/financeiro/receber", label: "A receber" },
    { href: "/produtos/compra", label: "Alertas · compra" },
  ].filter((l) => allow(l.href) && (operator || l.href === "/comissao"));

  return (
    <div className={`station ${open ? "is-open" : ""}`} data-shell={template}>
      <aside className="station-rail" aria-label="Navegação">
        <div className="station-brand">
          <p className="station-wordmark">BeautyOS</p>
          <p className="station-house">{user.accountName}</p>
        </div>

        <button
          type="button"
          className="station-theme"
          onClick={toggleTemplate}
          aria-pressed={template === "barber"}
          aria-label="Alternar template visual"
        >
          <span className="station-theme-a">A salão</span>
          <span className="station-theme-b">B barbeiro</span>
        </button>

        <nav className="station-ops" aria-label="Operação">
          {hot.map((link) => (
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
              <details
                key={group.name}
                className="station-fold"
                open={group.items.some((i) => i.href === current)}
              >
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

        <div className="station-rail-foot">
          <div className="station-who">
            <strong>{user.name}</strong>
            <span>{ROLE_LABEL[user.role] ?? user.role}</span>
          </div>
          <form action={logout} className="station-logout">
            <SubmitButton label="Sair" pendingLabel="…" className="quiet" />
          </form>
        </div>
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
        </header>
        <main className="station-work content">{children}</main>
      </div>

      <aside className="station-mirror" aria-label="Espelho do dia">
        <p className="station-mirror-label">Espelho</p>
        <div className="station-mirror-stack">
          {mirrorLinks.map((link) => (
            <Link key={link.href} href={link.href} className="station-mirror-card">
              {link.label}
            </Link>
          ))}
          {mirrorLinks.length === 0 ? (
            <p className="station-mirror-empty">Sem atalhos neste papel.</p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
