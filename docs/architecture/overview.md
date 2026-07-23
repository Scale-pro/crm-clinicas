# Visão geral da arquitetura

- **Objetivo:** dar a visão de alto nível da stack, da arquitetura modular e do
  sequenciamento das fases.
- **Escopo:** stack, monólito modular, acesso ao banco, fila, isolamento de
  painéis, segurança transversal, fases F0–F7 e pontos substituíveis por interface.
- **ADRs relacionados:** [ADR-001](../adr/ADR-001-hospedagem-vercel.md),
  [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-003](../adr/ADR-003-monolito-modular-e-convergencia-de-dominio.md),
  [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md),
  [ADR-009](../adr/ADR-009-fila-qstash-substituivel.md),
  [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md).
- **Decisões pendentes relacionadas:** provedor final de logs/observabilidade.
- **Última revisão:** 2026-07-23.

> Os ADRs são autoritativos. Este documento resume como as decisões se encaixam.

## 1. Stack

| Camada | Escolha | ADR |
|---|---|---|
| Hospedagem | **Vercel** (fixa) | [001](../adr/ADR-001-hospedagem-vercel.md) |
| Framework | **Next.js** (App Router), runtime **Node.js** padrão | [008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md) |
| Linguagem | **TypeScript** (`strict`) | — |
| UI | React + **Tailwind + shadcn/ui + Radix** | [011](../adr/ADR-011-design-system-e-acessibilidade.md) |
| Banco/Auth | **Supabase (PostgreSQL + Auth)**, RLS primário | [002](../adr/ADR-002-supabase-acesso-hibrido.md) |
| Fila | **QStash/Upstash** atrás de `shared/queue` | [009](../adr/ADR-009-fila-qstash-substituivel.md) |
| Observabilidade | logger sanitizado + captura de erros; provedor final *pendente* | [012](../adr/ADR-012-seguranca-por-fase-e-governanca.md) |

## 2. Arquitetura: monólito modular por domínio

Um **monólito modular** dentro do Next.js (sem microserviços). Cada módulo expõe
uma **interface pública** (`index.ts`); nenhum módulo alcança internals de outro.
Banco e fila são acessados por interfaces de `shared/`. Detalhes e regras em
[module-boundaries](module-boundaries.md)
([ADR-003](../adr/ADR-003-monolito-modular-e-convergencia-de-dominio.md)).

### Acesso ao banco (híbrido)

- **RLS sempre ligado** (`enable` + `force`) como camada primária de isolamento.
- Fluxos normais usam a **sessão/JWT do usuário**; o banco aplica o RLS.
- **`service role` só na lista fechada** (cron, webhooks, plataforma agregada,
  migrations/seeds).
- **Connection pooling é obrigatório** (Supavisor em transaction mode).

Detalhes em [multitenancy-security](multitenancy-security.md)
([ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
[ADR-004](../adr/ADR-004-multitenant-membership-based.md)).

### Isolamento dos painéis

O **painel da clínica** (`/(clinic)`) e o **painel da plataforma/superadmin**
(`/(platform)`) ficam em grupos de rotas separados, com autorização própria. O
superadmin não enxerga dados de clínica por padrão
([ADR-005](../adr/ADR-005-superadmin-isolado-e-support-grants.md)).

## 3. Diagrama textual de alto nível

```
                 ┌───────────────────────── Vercel (Next.js, Node runtime) ─────────────────────────┐
                 │                                                                                    │
  Provedores     │   app/                          modules/ (domínio)             shared/             │
  WhatsApp  ───► │  ├─ (clinic)/  ── UI clínica ─► pipeline / scheduling ──┐   ┌─ db (Supabase) ─┐    │
  (Cloud/Evo)    │  ├─ (platform)/─ UI superadmin  contacts / messaging    │   │  queue (QStash) │    │
                 │  └─ api/webhooks/ ── ingest ──► attribution / tenancy ───┼──►│  observability  │    │
  Navegador ───► │        (assinatura+idempotência)   ▲    ▲                │   │  auth / ui      │    │
  (tracking)     │                                    │    │ casos de uso   │   └────────┬────────┘    │
                 └────────────────────────────────────┼────┼───────────────┼────────────┼─────────────┘
                                                       │    │               │            │
                                         Realtime ◄────┘    │        ┌───────▼───────┐    ▼
                                        (Kanban/conversas)  │        │  PostgreSQL   │  QStash
                                                            │        │  (RLS force)  │  (retry/DLQ)
                                    fila (processor) ◄───────┴───────►│  Supabase     │
                                                                      └───────────────┘
```

- **Ingest → Processor → Realtime** é o caminho da mensagem
  ([messaging-attribution](messaging-attribution.md),
  [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md)).
- O domínio fala com banco/fila **apenas** por `shared/`.

## 4. Segurança transversal

A cibersegurança/SSDLC é **distribuída por fase** — cada fase implementa seus
controles; a **F7 comprova** (pentest, teste de restauração, revisão final, gate).
Nenhuma clínica real opera com dados reais antes da aprovação da F7. Base:
[ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md).

## 5. Sequenciamento F0–F7 e dependências

| Fase | Escopo | Depende de |
|---|---|---|
| **F0** | Fundação técnica, CI, segurança base, governança | — |
| **F1** | Multi-tenant, autenticação, segurança de acesso | F0 |
| **F2** | CRM comercial e Kanban | F1 |
| **F3** | WhatsApp inbound (+ captura de atribuição) | F2 (e F1) |
| **F4** | Agenda e operação da clínica | F2 |
| **F5** | Atribuição e rastreamento (ampliação/relatórios) | F3 |
| **F6** | Dashboard e relatórios | F4, F5 |
| **F7** | Validação final, hardening, gate | F0–F6 |

Ordem deliberada: **WhatsApp (F3) logo após o CRM comercial (F2)**, antes da
agenda (F4), porque a promessa central é o lead no Kanban. A agenda entra antes
dos relatórios completos para permitir relacionar origem do lead com
agendamentos, avaliações, orçamentos e vendas.

## 6. Pontos substituíveis por interface

Projetados para troca futura sem alterar regras de domínio:

- **Fila** (`shared/queue`): QStash pode ser trocado mantendo as garantias
  (retry/DLQ/idempotência) — [ADR-009](../adr/ADR-009-fila-qstash-substituivel.md).
- **Provedores de WhatsApp** (adapters): Cloud API e Evolution atrás da mesma
  interface de evento normalizado — [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md).
- **Observabilidade** (`shared/observability`): logger sanitizado desacopla o
  código do provedor final (ainda *pendente de decisão*).

## 7. Decisões pendentes (arquitetura)

- **Provedor final de logs e observabilidade.**
  *Pendente de decisão antes do uso de dados reais.*
