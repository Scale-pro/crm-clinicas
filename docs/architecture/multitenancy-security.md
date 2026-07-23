# Multi-tenant e segurança de acesso

- **Objetivo:** descrever como o isolamento entre clínicas e a autorização são
  aplicados na prática.
- **Escopo:** identidade, vínculo, clínica ativa, RLS, permissões por ação,
  service role, `SECURITY DEFINER`, superadmin, support grants, PermissionGate,
  testes cross-tenant e a matriz ameaça→controle.
- **ADRs relacionados:** [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-004](../adr/ADR-004-multitenant-membership-based.md),
  [ADR-005](../adr/ADR-005-superadmin-isolado-e-support-grants.md),
  [ADR-011](../adr/ADR-011-design-system-e-acessibilidade.md),
  [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md).
- **Decisões pendentes relacionadas:** retenção/anonimização de dados pessoais;
  política de consentimento e base legal (ver §9).
- **Última revisão:** 2026-07-23.

> Os ADRs são autoritativos. Aqui está a aplicação prática; regras normativas em
> [CLAUDE.md](../../CLAUDE.md).

## 1. Os três conceitos que não se misturam

| Conceito | O que é | Onde vive | Autoriza? |
|---|---|---|---|
| **Identidade** | `auth.uid()` da sessão | JWT do Supabase Auth (assinado) | Base |
| **Vínculo (membership)** | Clínicas do usuário e papéis | `clinic_members` | Sim |
| **Clínica ativa (active clinic)** | Qual clínica está sendo vista | Contexto de UX (cookie assinado, revalidado) | **Nunca** |

A autorização deriva de **Identidade + Vínculo**, resolvidos no banco. A **clínica
ativa** apenas estreita o que já é permitido; nunca concede acesso e é sempre
revalidada contra os vínculos reais
([ADR-004](../adr/ADR-004-multitenant-membership-based.md)).

## 2. Resolução do tenant (membership-based)

- `auth_clinic_ids()` — retorna as clínicas ativas do usuário a partir de
  `clinic_members`. Políticas usam `clinic_id in (select auth_clinic_ids())`.
- `has_permission(clinic_id, 'acao')` — autorização **por ação**, nunca por
  comparação de cargo espalhada.
- Papéis (`owner`, `admin`, `gestor_comercial`, `sdr`, `recepcionista`,
  `profissional`) e permissões vivem em `roles`/`permissions`/`role_permissions`
  (ver [data-model](data-model.md)). Cargos personalizados = preparado, não no MVP.

## 3. RLS — políticas separadas por operação

Para toda tabela de tenant ([ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
[ADR-004](../adr/ADR-004-multitenant-membership-based.md)):

- `enable` **e** `FORCE ROW LEVEL SECURITY` (vale até para o dono da tabela).
- **Políticas separadas** para SELECT / INSERT / UPDATE / DELETE.
- `WITH CHECK` impede alteração de `clinic_id` (anti-reatribuição de tenant).
- `clinic_id` é a **primeira coluna** dos índices compostos de tenant.
- Performance: `(select auth.uid())` (avaliação única por statement) e funções
  auxiliares `stable`.

Exemplo **conceitual, não implementado**:

```sql
-- ILUSTRATIVO — não é migration
create policy contacts_select on contacts for select
using ( clinic_id in (select auth_clinic_ids()) );

create policy contacts_update on contacts for update
using     ( clinic_id in (select auth_clinic_ids()) )
with check ( clinic_id in (select auth_clinic_ids())
             and has_permission(clinic_id, 'contact.edit') );
```

## 4. Service role — lista fechada

`service role` **ignora RLS**; por isso fica restrita a: jobs de Vercel Cron,
webhooks, operações de plataforma agregadas (só leitura), migrations/seeds.
**Nunca** em fluxos normais de usuário, páginas, Server Actions ou operações
comuns da clínica ([ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md)).

## 5. `SECURITY DEFINER` endurecido

Cadastro da 1ª clínica e aceite de convite usam funções `SECURITY DEFINER`
validadas (não `service role`). Toda função definer: `search_path` fixo com
schemas explícitos, privilégio mínimo, validação rigorosa, `EXECUTE` **revogado
de `PUBLIC`** e concedido só aos papéis necessários.

## 6. Superadmin isolado e support grants

- Superadmin vive em `platform_admins`, opera em `/(platform)`, e **não** enxerga
  dados de clínica por padrão.
- Acesso a uma clínica só via **`support_grant`** escopado a **uma** clínica, com
  nível explícito (`read_only` padrão / `support_operations` / `restricted_write`),
  motivo obrigatório, expiração automática e revogação imediata.
- Ações proibidas mesmo com grant (checam `via <> 'support'`): trocar proprietário,
  excluir clínica, alterar plano fora do fluxo próprio, ver/alterar credenciais de
  integrações, criar grants, alterar papéis do proprietário, desativar auditoria.
- **Banner visual obrigatório** durante operação sob grant; **toda ação é
  auditada** (`before`/`after`); a clínica pode consultar o histórico depois.
Base: [ADR-005](../adr/ADR-005-superadmin-isolado-e-support-grants.md).

## 7. PermissionGate é apenas UX

`PermissionGate` só esconde/desabilita ações na interface. **Nunca** é mecanismo
de autorização. Toda operação exige, no servidor: **guard** (sessão + tenant +
permissão), **validação de campos permitidos** (allowlist/Zod) e **RLS** no banco
([ADR-011](../adr/ADR-011-design-system-e-acessibilidade.md)).

## 8. Matriz ameaça → controle

| Ameaça | Controle | Camada responsável | Teste futuro | Fase |
|---|---|---|---|---|
| Leitura cross-tenant | RLS SELECT por `auth_clinic_ids()` | Banco | SELECT de outra clínica → 0 linhas | F1 |
| Escrita/edição cross-tenant | RLS INSERT/UPDATE/DELETE + `WITH CHECK` | Banco | UPDATE/DELETE de outra clínica negado | F1 |
| Reatribuição de `clinic_id` | `WITH CHECK` impede troca | Banco | mover registro p/ outra clínica negado | F1 |
| Confiar em `clinic_id` do cliente | tenant vem do vínculo, não do payload | App + Banco | payload com `clinic_id` alheio ignorado | F1/F3 |
| Escalada por cargo | `has_permission` por ação | App + Banco | ação sem permissão negada | F1/F2 |
| `service role` indevida | lista fechada + verificação automática | App/CI | lint detecta uso fora da lista | F0/F1 |
| Hijack de `SECURITY DEFINER` | `search_path` fixo, `EXECUTE` sem PUBLIC | Banco | catálogo: nenhum definer com PUBLIC | F1 |
| Superadmin onipotente | isolamento + grant escopado/auditado | App + Banco | superadmin sem grant negado | F1 |
| Abuso de support grant | níveis, expiração, ações proibidas, auditoria | App + Banco | grant expirado/proibido negado | F1 |
| Tabela nova sem RLS | verificação no catálogo | CI | toda tabela de tenant tem RLS | F0 |
| Mass assignment | allowlist Zod; sem `insert(body)` cru | App | escrita fora da allowlist rejeitada | F2 |
| PII/segredo em logs | logger sanitizado central | App | scanner detecta PII/raw_payload em log | F0/F3 |

## 9. Decisões pendentes (segurança multi-tenant)

- **Retenção e anonimização de dados pessoais.** *Pendente de decisão antes do uso
  de dados reais.*
- **Política de consentimento e base legal por tipo de dado.** *Pendente de
  decisão antes do uso de dados reais.*
