# Documentação — CRM Clínicas

CRM SaaS multi-tenant para clínicas de estética. Esta pasta reúne a
documentação de produto, arquitetura, segurança e operação, além dos registros
de decisão (ADRs).

## Hierarquia das fontes de verdade

Em caso de conflito, vale a ordem:

1. **ADRs aprovados** (`adr/`) — fonte autoritativa das decisões arquiteturais.
2. **Documentos de arquitetura** (`architecture/`) — como as decisões são aplicadas.
3. **`../CLAUDE.md`** — regras operacionais resumidas para agentes.
4. **`../AGENTS.md`** — orientação para agentes (aponta para o CLAUDE.md e ADRs).
5. **Testes de invariantes** — comprovação automática das regras críticas.

Uma decisão arquitetural **não pode ser alterada silenciosamente**: mudanças
passam por um novo ADR.

## Registros de decisão (ADRs)

Índice em [`adr/`](adr/). Template para novos ADRs: [`adr/ADR-template.md`](adr/ADR-template.md).

| ADR | Decisão |
|-----|---------|
| [001](adr/ADR-001-hospedagem-vercel.md) | Hospedagem na Vercel (fixa) |
| [002](adr/ADR-002-supabase-acesso-hibrido.md) | Supabase/Postgres, acesso híbrido, RLS primário |
| [003](adr/ADR-003-monolito-modular-e-convergencia-de-dominio.md) | Monólito modular + convergência de casos de uso |
| [004](adr/ADR-004-multitenant-membership-based.md) | Multi-tenant membership-based (`clinic_id` = tenant) |
| [005](adr/ADR-005-superadmin-isolado-e-support-grants.md) | Superadmin isolado + `support_grants` |
| [006](adr/ADR-006-modelo-de-dominio-pessoa-e-convencoes.md) | Modelo de domínio de pessoas + convenções de dados |
| [007](adr/ADR-007-atribuicao-multitouch.md) | Atribuição multi-touch por oportunidade |
| [008](adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md) | Ingestão assíncrona, adapters, idempotência |
| [009](adr/ADR-009-fila-qstash-substituivel.md) | Fila QStash atrás de interface substituível |
| [010](adr/ADR-010-correlacao-site-whatsapp.md) | Correlação site→WhatsApp por token + confiança |
| [011](adr/ADR-011-design-system-e-acessibilidade.md) | Design system + acessibilidade |
| [012](adr/ADR-012-seguranca-por-fase-e-governanca.md) | Segurança por fase, invariantes e governança |

## Mapa da documentação

Estado atual: **Commit 1 — Governança e decisões** (concluído). Os itens abaixo
marcados como *pendente* serão criados em commits posteriores, após revisão.

### Produto (`product/`) — *pendente (Commit 2)*
- `scope.md` — visão, personas, escopo do MVP, fora do MVP.

### Arquitetura (`architecture/`) — *pendente (Commit 2)*
- `overview.md` — stack, monólito modular, acesso ao banco, fila.
- `multitenancy-security.md` — RLS, membership, superadmin, support grants.
- `data-model.md` — entidades, relações, deduplicação, soft delete, atribuição.
- `messaging-attribution.md` — ingest/processor/adapters, idempotência, SLO.
- `ui-and-navigation.md` — navegação, telas, primeiro fluxo vertical.
- `module-boundaries.md` — fronteiras de módulos e convergência de domínio.

### Segurança (`security/`) — *pendente (Commit 3)*
- `ssdlc.md`, `deploy-checklist.md`, `data-classification.md`,
  `shared-responsibility.md`, `pentest-scope.md`, `dr.md`.

### Runbooks (`runbooks/`)
- `primeiro-ambiente.md` — provisionar o primeiro ambiente real (Supabase
  hospedado + Vercel), do zero, sem Docker.
- `bootstrap-platform-admin.md` — conceder o primeiro acesso de plataforma.
- `webhook-dlq.md`, `webhook-reconciliation.md`, `security-incident.md`,
  `backup-restore.md`, `provider-outage.md`.

## Ordem recomendada de leitura

Para entender o projeto do geral ao específico:

1. [`../CLAUDE.md`](../CLAUDE.md) — regras operacionais e invariantes (visão rápida).
2. Este `README.md` — índice, fases e hierarquia das fontes de verdade.
3. Os **ADRs** em [`adr/`](adr/), na ordem 001 → 012 — as decisões autoritativas.
4. Documentos de **produto** e **arquitetura** (`product/`, `architecture/`) — *a
   partir do Commit 2* — para como as decisões são aplicadas.
5. Documentos de **segurança** e **runbooks** (`security/`, `runbooks/`) — *a
   partir do Commit 3*.
6. [`../AGENTS.md`](../AGENTS.md) — porta de entrada curta para agentes (aponta de
   volta para o CLAUDE.md e os ADRs).

## Fases de desenvolvimento (visão geral)

| Fase | Escopo |
|------|--------|
| F0 | Fundação técnica, CI, segurança base, governança |
| F1 | Multi-tenant, autenticação e segurança de acesso |
| F2 | CRM comercial e Kanban |
| F3 | WhatsApp inbound (captura de atribuição desde a 1ª mensagem) |
| F4 | Agenda e operação da clínica |
| F5 | Atribuição e rastreamento (ampliação e relatórios) |
| F6 | Dashboard e relatórios |
| F7 | Validação final, hardening e pré-lançamento (gate de segurança) |

O produto pode ser demonstrável antes da F7, mas **nenhuma clínica real opera com
dados reais até a aprovação do gate de segurança (F7)** — ver
[ADR-012](adr/ADR-012-seguranca-por-fase-e-governanca.md).

## Decisões pendentes explícitas

Valores ainda **não definidos** — a serem decididos e registrados em ADR antes de
dados reais. Não devem ser preenchidos com números inventados:

- **Retenção do `raw_payload`** dos webhooks (estratégia em camadas; ver Commit 3).
- **RPO / RTO** e frequência dos testes de restauração.
- **Prazo de retenção/anonimização** de dados pessoais.
- **Provedor final de logs e observabilidade** (ex.: Sentry e um provedor de logs
  ainda não escolhido em definitivo).
