# Módulos de domínio

Estrutura definida em
[docs/architecture/module-boundaries.md](../../docs/architecture/module-boundaries.md)
(ADR-003). **Cada módulo é criado na fase em que seu domínio é implementado** —
não criamos diretórios ou interfaces vazias antecipadamente.

| Módulo | Responsabilidade | Fase |
|---|---|---|
| `tenancy` | clínicas, membros, convites, features/limites, support_grants | F1 |
| `identity` | auth, papéis, permissões, sessão, guards | F1 |
| `contacts` | contato unificado, normalização, deduplicação | F2 |
| `pipeline` | oportunidades, estágios, activities, motivos de perda | F2 |
| `tasks` | follow-ups, lembretes (cron) | F2 |
| `messaging` | conversas, mensagens, adapters, ingest, processor | F3 |
| `attribution` | tracking links/clicks, touchpoints, ad_*, conversion_events | F3/F5 |
| `scheduling` | profissionais, procedimentos, agendamentos, patients | F4 |
| `quotes` | orçamentos e itens | F4 |
| `reporting` | dashboard e relatórios | F6 |
| `platform-admin` | lógica do superadmin (isolada) | F1+ |

## Regras (verificadas por ESLint e dependency-cruiser)

- Cada módulo expõe **apenas** `index.ts` como interface pública; importar
  internals de outro módulo é **proibido**.
- Módulos acessam banco/fila **somente** via `@/shared/db` e `@/shared/queue`.
- Módulos **não** importam `src/app/`; `shared/` **não** importa módulos.
- Sem dependências circulares.
