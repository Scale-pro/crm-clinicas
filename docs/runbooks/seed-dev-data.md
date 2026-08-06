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

## Estado atual: ferramenta dormante

**Hoje não há ambiente neste projeto onde este script possa rodar.** Ele foi
mesclado para não se perder, não porque esteja em uso. Antes de tentar rodá-lo,
saiba o que falta:

- **Ele exige uma stack Supabase local**, que por sua vez exige um **daemon
  Docker em execução**. As sessões de desenvolvimento usadas neste projeto até
  agora não têm daemon Docker disponível — o binário pode existir, mas
  `docker info` falha, e sem ele `pnpm supabase start` não sobe.
- **Um projeto Supabase hospedado não é alternativa hoje.** O repositório não
  está linkado a nenhum projeto remoto (não há `supabase/.temp/project-ref`) e,
  mesmo que estivesse, a guarda de segurança do script recusa qualquer
  `API_URL` fora de `127.0.0.1`/`localhost` (ver "Guarda de segurança"). Apontar
  o seed para um projeto hospedado exigiria **afrouxar essa guarda** — uma
  decisão deliberada, não um ajuste de configuração, já que ela existe
  justamente para impedir que dados fictícios cheguem a staging ou produção.
- **O CI não cobre este script.** O job `database-auth` sobe a stack Supabase
  com Docker no runner, mas **nenhum workflow chama `pnpm seed:dev`**. Portanto
  o CI verde **não** é evidência de que o seed funciona.

Consequência prática: o script **nunca foi executado ponta a ponta contra uma
stack real**. `pnpm lint`, `pnpm typecheck`, `pnpm depcruise` e `pnpm test`
passam, mas isso cobre apenas tipos e fronteiras — não o comportamento contra o
banco. A primeira pessoa que conseguir Docker local deve tratar a primeira
execução como **validação**, não como uso rotineiro, e corrigir o que aparecer.

O script segue versionado de propósito: reescrevê-lo do zero depois custa mais
do que mantê-lo aqui, à espera do ambiente que o torne executável.

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

> Os passos abaixo pressupõem os pré-requisitos satisfeitos. Enquanto o primeiro
> deles não estiver — ver "Estado atual: ferramenta dormante" —, esta seção
> descreve o procedimento pretendido, não um caminho hoje percorrível.

- **Daemon Docker em execução** (a stack local do Supabase depende dele).
  Verifique com `docker info` antes de tudo: binário instalado não basta. Este é
  o pré-requisito que hoje não é satisfeito no ambiente do projeto.
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

- **Não validado em execução real.** Nenhuma das limitações abaixo foi observada
  rodando o script; são as previstas por leitura do código e das RPCs. Podem
  existir outras, ainda desconhecidas, que só a primeira execução revelará.
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
