# Próximo ciclo — Agente WhatsApp

Painel operacional fechado (2026-10-29). Este doc é o ponto de partida do ciclo do agente.

## Já existe no código

| Peça | Onde |
|------|------|
| Conversas | `app/agente/page.tsx` |
| Config (persona, canal, espera) | `app/agente/config/page.tsx` |
| Evolution (QR / pareamento) | `src/ui/evolution-panel.tsx`, `src/agent/evolution/*` |
| Webhook inbound | `src/agent/evolution/inbound.ts` → `/api/agent/webhook` |
| Runtime + tools (agenda, pacotes, espera…) | `src/agent/runtime.ts`, `src/agent/tools.ts` |
| LLM opcional | `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` em `runtime.ts` |

## Env necessário em produção (EasyPanel)

Hoje o serviço tem `DATABASE_URL` + `NFCE_LOOKUP_*`. Falta para o agente:

```
APP_URL=https://beautyos-app.kxryyk.easypanel.host
NEXT_PUBLIC_APP_URL=https://beautyos-app.kxryyk.easypanel.host
EVOLUTION_URL=…
EVOLUTION_API_KEY=…
AGENT_WEBHOOK_SECRET=…
OPENAI_API_KEY=…          # se quiser respostas LLM; sem chave, cai no runtime por regras
OPENAI_MODEL=gpt-4o-mini  # opcional
```

Ver `.env.example`.

## Ordem de trabalho sugerida

1. Confirmar Evolution acessível da VPS (URL + API key).
2. Setar env no EasyPanel e redeploy.
3. Em `/agente/config`: criar/parear instância (QR) e copiar webhook com token.
4. Smoke: mensagem “serviços” / “meus horários” no WhatsApp → resposta no painel.
5. Só então endurecer persona / LLM / short-circuits (espelhar lições do app-barbearia `docs/DONNA.md` se fizer sentido — sem copiar segredos).

## Fora deste ciclo

Cupom desconto, clubes, promo, PWA cliente, Open Finance, Next 16.
