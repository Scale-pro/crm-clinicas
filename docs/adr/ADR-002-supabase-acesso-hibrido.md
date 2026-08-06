# ADR-002: Supabase/Postgres com acesso híbrido e RLS como camada primária

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** F1 (fundação); transversal
- **Documentos relacionados:** [multitenancy-security](../architecture/multitenancy-security.md) *(Commit 2)*

## Contexto

Precisamos de um Postgres gerenciado compatível com a Vercel, com autenticação
pronta e isolamento multi-tenant robusto. O maior risco não é a escolha do banco,
mas **como** o Next.js fala com ele em ambiente serverless sem enfraquecer o
isolamento entre clínicas.

## Decisão

Usaremos **Supabase (Postgres + Auth)** com **acesso híbrido**:

1. **RLS (Row Level Security) é a camada primária de proteção multi-tenant** e
   permanece ativo em todas as tabelas de tenant (`enable` + `force`).
2. Nos fluxos comuns (páginas, Server Actions, operações da clínica), o acesso
   ocorre **com a sessão e o JWT do usuário autenticado**, para que o banco
   aplique o RLS.
3. **A `service role` não é usada em fluxos normais de usuário.** Ela fica
   restrita a uma **lista fechada** de operações administrativas/técnicas,
   executadas só no servidor, com validação, auditoria e justificativa:
   - Jobs do Vercel Cron (follow-ups, lembretes, reconciliação).
   - Webhooks externos (sem sessão de usuário).
   - Operações de plataforma que agregam métricas cross-tenant (só leitura).
   - Migrações/seeds técnicos.
4. Cadastro da primeira clínica e aceite de convite usam funções
   **`SECURITY DEFINER`** validadas — **não** `service role`.
5. **Connection pooling é obrigatório** (Supavisor/pooler em transaction mode).
6. Nenhuma operação depende apenas de um filtro `clinic_id` aplicado pelo
   frontend.

### Endurecimento de `SECURITY DEFINER` (invariante)

Toda função `SECURITY DEFINER` deve: fixar `search_path` (schemas explícitos),
usar privilégio mínimo, validar rigorosamente a entrada, ter `EXECUTE` revogado
de `PUBLIC` e concedido apenas aos papéis necessários.

## Consequências

- **Positivas:** isolamento aplicado pelo banco (defense-in-depth); superfície
  de erro humano reduzida; caminho de cadastro/convite sem chave-mestra.
- **Negativas / custos:** disciplina permanente — cada tabela nova exige RLS e
  políticas; políticas mal escritas custam performance (mitigado no ADR-004).
- **Impacto em testes:** suíte de isolamento multi-tenant no CI; verificação no
  catálogo do Postgres de que nenhuma tabela de tenant está sem RLS e nenhuma
  função `SECURITY DEFINER` mantém `EXECUTE` para `PUBLIC`.

## Alternativas consideradas

- **ORM com conexão direta rodando como `service role`:** rejeitada — desliga o
  RLS e joga todo o isolamento para o código de aplicação.
- **Isolamento só na aplicação (sem RLS):** rejeitada — frágil, um bug vaza
  dados entre clínicas.

## Como alterar esta decisão

Novo ADR aprovado. O código não pode acessar dados de tenant fora deste modelo.

## Changelog

- **2026-08-06 (F2/WhatsApp):** o webhook da UAZAPI (`/api/whatsapp/uazapi/webhook`)
  e o worker da fila (`/api/whatsapp/worker`) se tornaram o primeiro consumidor
  concreto da exceção "webhooks externos" da decisão 3. Até então, o teste de
  arquitetura que impede vazamento de `service role`/chave secreta para
  `src/` era um regex genérico proibindo a string em qualquer lugar — nenhuma
  exceção fechada existia porque nenhum código a usava de fato. Com o consumidor
  real chegando, o guard (`tests/architecture/f1-final-validation.test.ts`)
  passou de "a string nunca aparece" para uma **allowlist fechada dos 3
  arquivos** autorizados a citar `SUPABASE_SECRET_KEY`/`service_role` — mais
  estrito que o regex anterior, porque renomear o construtor não bastaria mais
  para escapar do teste, só a lista explícita:
  - `src/shared/db/technical.ts` — único construtor do executor técnico, que
    expõe apenas `rpc()` (nunca `from()`, então nenhuma tabela é alcançável
    diretamente por ele).
  - `src/shared/config/env-schema.ts` e `src/shared/config/index.ts` —
    declaração e leitura da variável de ambiente.

  Um segundo guard, em `tests/architecture/f2-whatsapp-uazapi.test.ts`, fecha a
  outra ponta: quem pode *chamar* `createTechnicalRpcExecutor()` é uma lista à
  parte de 4 arquivos — os 2 acima mais `src/app/api/whatsapp/uazapi/webhook/route.ts`
  e `src/app/api/whatsapp/worker/route.ts`, os dois pontos sem sessão de
  usuário que de fato usam o executor.
