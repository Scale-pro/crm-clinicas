# Runbook — Seed de dados de desenvolvimento

- **Objetivo:** popular a stack Supabase **local** com uma clínica, profissionais,
  procedimentos e contatos fictícios, o suficiente para exercitar a grade da
  agenda (F2.3.1) manualmente, sem depender de cadastro manual repetitivo.
- **Escopo:** apenas ambiente de desenvolvimento local (`pnpm supabase start`).
  Nunca staging ou produção.
- **ADRs relacionados:** [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md)
  (RPCs autorizadas, service role restrito), [ADR-004](../adr/ADR-004-multitenant-membership-based.md),
  [ADR-006](../adr/ADR-006-modelo-de-dominio-pessoa-e-convencoes.md) (timezone,
  E.164).
- **Última revisão:** 2026-08-06.

> `supabase/seed.sql` permanece intencionalmente vazio (ver CLAUDE.md). Este
> script é uma ferramenta **separada e opt-in** — nunca roda automaticamente
> junto de `supabase db reset` ou de CI.

## O que o script faz

`scripts/seed-dev/index.ts` (rodado via `pnpm seed:dev`) cria, chamando
**apenas as RPCs públicas** já usadas pela aplicação (sem `insert` direto em
tabela de tenant e sem `service role` fora do uso já previsto para
provisionar o usuário via Auth Admin API):

- 1 usuário dono local (`dev-seed-owner@example.test`) com MFA (TOTP)
  verificado, necessário porque as RPCs de profissional/procedimento exigem
  AAL2.
- 1 clínica (`Clínica Dev Seed`, timezone `America/Sao_Paulo`).
- 3 profissionais ativos, com especialidades distintas e disponibilidade
  semanal em dias úteis (segunda a sexta) — suficiente para a grade da agenda
  mostrar 3 colunas.
- 6 procedimentos (30, 45, 60 e 75 minutos; preços distintos), vinculados aos
  profissionais correspondentes.
- 9 contatos fictícios.
- **Nenhum agendamento** — a tabela `appointments` e as RPCs de agendamento
  vêm do PR #21 (F4), que ainda não está nesta branch.

O script é **idempotente**: roda quantas vezes forem necessárias sem duplicar
linhas. Cada entidade é criada com uma `idempotency_key` fixa (profissionais,
procedimentos, contatos) ou é naturalmente idempotente pela própria RPC
(clínica, especialidades, vínculo profissional↔procedimento). A
disponibilidade semanal lê a versão atual do profissional antes de gravar,
então uma segunda execução com os mesmos horários não altera nada.

## Pré-requisitos

- Docker rodando (a stack local do Supabase depende dele).
- `pnpm install` já executado.
- Stack local iniciada: `pnpm supabase start`.
- Variáveis de ambiente da stack local exportadas no shell atual — os mesmos
  nomes usados por `pnpm test:db` e pelo CI:

  ```bash
  set -o allexport
  source <(pnpm --silent supabase status -o env)
  set +o allexport
  export NEXT_PUBLIC_SUPABASE_URL="$API_URL"
  export NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="${PUBLISHABLE_KEY:-$ANON_KEY}"
  ```

  Alternativamente, copie os mesmos valores para `.env.local` (ver
  `.env.example`) e exporte-os antes de rodar o script — ele não lê
  `.env.local` sozinho, apenas `process.env`.

## Como rodar

```bash
pnpm seed:dev
```

Ao final, o script imprime o e-mail/senha do usuário dono (`dev-seed-owner@example.test`
/ `Local-only-test-password-123!`) — use para entrar na aplicação local e
navegar até `/app` para ver a clínica semeada.

## Guarda de segurança

O script recusa rodar se `API_URL` ou `NEXT_PUBLIC_SUPABASE_URL` não apontar
para `127.0.0.1`/`localhost` — não há como apontá-lo para staging ou produção
por engano.

## Limitações conhecidas

- MFA local tem limite de 10 fatores por usuário
  (`supabase/config.toml` → `auth.mfa.max_enrolled_factors`). O script tenta
  remover fatores de execuções anteriores antes de registrar um novo, mas a
  remoção de um fator já verificado pode exigir uma sessão AAL2 que ainda não
  existe nesse ponto — nesse caso a tentativa de limpeza falha silenciosamente
  e o fator antigo fica órfão. Depois de muitas execuções sem resetar o banco,
  rode `pnpm supabase db reset` (que também reaplica as migrations) para
  limpar o estado de Auth local.
- Se o banco local já tiver uma clínica com o slug `seed-dev-clinica` criada
  por **outro** usuário, a criação da clínica falha (slug é único). Isso não
  deve acontecer numa stack local recém-resetada.
