# ADR-004: Multi-tenant membership-based (clinic_id como tenant)

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** F1
- **Documentos relacionados:** [multitenancy-security](../architecture/multitenancy-security.md) *(Commit 2)*

## Contexto

Precisamos que o RLS "saiba" a qual clínica o usuário pertence, sem confiar em
`clinic_id` enviado pelo cliente, e sem bloquear um futuro cenário multi-clínica
(uma pessoa em várias clínicas), embora hoje "uma clínica = um tenant" e não haja
redes/franquias.

## Decisão

Autorização derivada de **Identidade + Vínculo**, resolvida no banco:

1. **Identidade:** `auth.uid()` do JWT do Supabase Auth (fonte da verdade).
2. **Vínculo:** tabela `clinic_members` (pessoa × clínica × papel × status).
3. **`clinic_id` é o identificador direto do tenant.** Não há camada de
   organização/grupo/franquia no MVP, mas a modelagem não a impede no futuro.
4. As políticas RLS usam uma função `auth_clinic_ids()` (membership-based) que
   retorna as clínicas ativas do usuário. Padrão: `clinic_id in (select
   auth_clinic_ids())`. Isso já suporta multi-clínica futuro sem retrabalho.
5. **`clinic_id` ativo é apenas contexto de navegação/filtro da aplicação.**
   Nunca concede acesso; é sempre revalidado contra os vínculos reais. O RLS
   garante segurança; o filtro garante foco.
6. Verificações de permissão são **por ação** (`has_permission(clinic_id,
   'perm')`), nunca por comparação de cargo espalhada.

### Invariantes de RLS

- Toda tabela de tenant: `clinic_id` obrigatório (FK), RLS `enable` + `force`,
  políticas **separadas** para SELECT/INSERT/UPDATE/DELETE, `with check`
  impedindo alteração de `clinic_id`.
- `clinic_id` é a **primeira coluna** de índices compostos de tenant.
- Performance: usar `(select auth.uid())` (avaliação única por statement) e
  funções auxiliares `stable`.

## Emenda de 2026-07-27 — escrita de tenant exclusivamente por RPC

Esta emenda substitui, para a implementação da F1, a exigência original acima
de políticas de escrita direta em toda tabela de tenant. O texto anterior é
mantido para registrar a evolução da decisão.

- Leituras autorizadas continuam usando RLS, com `ENABLE` e `FORCE`.
- Mutações normais das tabelas de tenant são expostas exclusivamente por RPCs
  autorizadas; `authenticated` não recebe `GRANT` direto de `INSERT`, `UPDATE`
  ou `DELETE` nessas tabelas.
- A ausência de políticas de escrita é intencional: cada RPC valida identidade,
  tenant, permissão, AAL2 quando aplicável e parâmetros não confiáveis antes da
  mutação.
- A abordagem é mais restritiva, reduz a superfície de escrita e evita dividir
  regras entre Data API e RPC, preservando RLS como defesa em profundidade.
- Se uma tabela futura precisar de escrita direta pela Data API, isso exigirá
  `GRANT` mínimo explícito, políticas separadas por operação, `USING`, `WITH
  CHECK`, proteção contra alteração de `clinic_id` e teste de catálogo dedicado.

## Consequências

- **Positivas:** isolamento forte; multi-clínica futuro gratuito; nenhuma
  confiança em `clinic_id` do cliente.
- **Negativas / custos:** custo de subquery por statement (mitigado por índices e
  `stable`); disciplina de índices `clinic_id`-first.
- **Impacto em testes:** suíte de isolamento (SELECT/INSERT/UPDATE/DELETE
  cross-tenant negados; reatribuição de `clinic_id` negada; membro suspenso perde
  acesso); teste de que toda tabela de tenant tem RLS.

## Alternativas consideradas

- **`clinic_id` fixo em claim do JWT:** rejeitada para o MVP — quebra
  multi-clínica e complica cadastro/convite (reemissão de token). Reservada como
  otimização futura (cache), mantendo `clinic_members` como verdade.
- **Isolamento só na aplicação:** rejeitada (ver ADR-002).

## Como alterar esta decisão

Novo ADR aprovado.
