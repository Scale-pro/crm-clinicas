# Fronteiras de módulos

- **Objetivo:** definir com rigor as responsabilidades, interfaces públicas e
  dependências permitidas/proibidas entre módulos, e onde vive cada camada
  técnica.
- **Escopo:** módulos de domínio, `shared/`, adapters, casos de uso, guards,
  validações, observabilidade, e a convergência de criação de contato/oportunidade.
- **ADRs relacionados:** [ADR-003](../adr/ADR-003-monolito-modular-e-convergencia-de-dominio.md),
  [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md),
  [ADR-009](../adr/ADR-009-fila-qstash-substituivel.md).
- **Decisões pendentes relacionadas:** nenhuma específica.
- **Última revisão:** 2026-07-23.

> Os ADRs são autoritativos. Regras normativas resumidas em
> [CLAUDE.md](../../CLAUDE.md). As verificações automáticas destas regras estão
> planejadas para a F0 ([ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md)).

## 1. Responsabilidade de cada módulo

| Módulo (`src/modules/…`) | Responsabilidade |
|---|---|
| `tenancy` | clínicas, membros, convites, features/limites, support_grants |
| `identity` | auth, papéis, permissões, sessão, guards de permissão |
| `contacts` | contato unificado, normalização, deduplicação |
| `pipeline` | oportunidades, estágios, activities, motivos de perda |
| `tasks` | follow-ups, lembretes (cron) |
| `messaging` | conversas, mensagens, **adapters**, ingest, processor |
| `attribution` | tracking links/clicks, touchpoints, ad_*, conversion_events |
| `scheduling` | profissionais, procedimentos, agendamentos, patients |
| `quotes` | orçamentos e itens |
| `reporting` | dashboard e relatórios |
| `platform-admin` | lógica do superadmin (isolada) |

## 2. Interface pública e regra contra internals

- Cada módulo expõe **um `index.ts`** com sua interface pública (casos de uso,
  tipos, funções). **O resto é interno.**
- **Proibido importar internals** de outro módulo — só o `index.ts` do outro
  módulo pode ser importado. Verificação automática planejada para a F0.

## 3. Dependências permitidas e proibidas

- **Permitido:** um módulo depender da **interface pública** de outro módulo
  quando fizer sentido de domínio; qualquer módulo depender de `shared/`.
- **Proibido:** importar arquivos internos de outro módulo; ciclos de dependência
  entre módulos; o domínio depender do formato de Meta/Evolution (só o evento
  normalizado); usar SDK de banco/fila fora das camadas autorizadas (§4).

## 4. Onde cada SDK/camada pode ser acessado

| Recurso | Local único autorizado | Proibido fora dele |
|---|---|---|
| **SDK do Supabase** (banco/auth) | `shared/db` (e `shared/auth` para sessão) | acesso direto ao SDK no domínio ou nas telas |
| **SDK do QStash** (fila) | `shared/queue` | acesso direto ao SDK em qualquer módulo |
| **Adapters de provedores** (Meta/Evolution) | `modules/messaging/adapters/` | parse de payload de provedor em qualquer outro lugar |
| **Casos de uso de domínio** | `index.ts` de cada módulo | lógica de domínio duplicada em rotas/handlers |
| **Guards** (sessão + tenant + permissão) | `shared/auth` (consumidos por Server Actions/Route Handlers) | autorização espalhada por componentes |
| **Validações Zod** | na **borda** de cada entrada (actions, handlers, adapters), com allowlist de campos | `insert(body)` cru (mass assignment) |
| **Observabilidade** (logger sanitizado, métricas) | `shared/observability` | `console` direto; PII/`raw_payload` em log |
| **`service role`** | lista fechada (cron/webhooks/plataforma/migrations) | fluxos comuns de usuário |

## 5. O que pertence a `shared/`

`shared/db`, `shared/auth`, `shared/ui`, `shared/queue`, `shared/observability`,
`shared/lib` (normalização de telefone/e-mail, formatação de data/moeda, utilidades
de validação). `shared/` **não** contém regra de negócio de um domínio específico —
apenas capacidades transversais e interfaces.

## 6. Convergência: um único conjunto centralizado de casos de uso

Todas as entradas que criam/localizam contato e abrem oportunidade **convergem
para o mesmo caso de uso de domínio** (ex.: `createOrFindContactAndOpenOpportunity`
— o nome pode mudar se outro representar melhor as responsabilidades, desde que a
lógica permaneça centralizada e reutilizável). Entradas que convergem:

- **Criação manual** (interface).
- **WhatsApp** (processor do webhook).
- **Formulários futuros.**
- **Importações futuras.**

Cada entrada fornece uma **entrada normalizada**; o caso de uso central executa,
de forma centralizada:

1. **Normalização** (telefone E.164, e-mail).
2. **Deduplicação**.
3. **Criação ou localização do contato**.
4. **Criação ou localização da oportunidade**.
5. **Definição de pipeline e etapa**.
6. **Atribuição de responsável** (round-robin/pool/manual).
7. **`activity`**.
8. **`attribution_touchpoint`**.
9. **Idempotência** quando existir chave externa.

**Proibido** haver lógica de deduplicação ou de criação de oportunidade
**duplicada** entre endpoints (manual, webhook, formulários, importações). Base:
[ADR-003](../adr/ADR-003-monolito-modular-e-convergencia-de-dominio.md);
mecânica de idempotência/atribuição em
[messaging-attribution](messaging-attribution.md).

## 7. Fluxo de dependência (texto)

```
app/ (rotas, UI)  ──►  modules/*/index.ts  ──►  shared/{db,queue,auth,observability,lib}
   │                        ▲                          │
   │  guards (shared/auth)  │  casos de uso            ▼
   └────────────────────────┘                   Supabase / QStash
messaging/adapters/  ──►  evento normalizado  ──►  caso de uso central (convergência)
```

Setas apontam para dependências permitidas. Nada no sentido inverso; nada
pulando `shared/` para tocar SDKs diretamente.

## 8. Decisões pendentes (fronteiras)

Nenhuma decisão pendente específica de fronteiras de módulos.
