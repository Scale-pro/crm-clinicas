# Modelo de dados

- **Objetivo:** consolidar o modelo conceitual do domínio e as convenções de
  dados.
- **Escopo:** entidades do MVP e preparadas, relações, deduplicação, normalização,
  soft delete, append-only, entitlements/limites, convenções de data/locale e
  classificação de dados.
- **ADRs relacionados:** [ADR-004](../adr/ADR-004-multitenant-membership-based.md),
  [ADR-006](../adr/ADR-006-modelo-de-dominio-pessoa-e-convencoes.md),
  [ADR-007](../adr/ADR-007-atribuicao-multitouch.md),
  [ADR-005](../adr/ADR-005-superadmin-isolado-e-support-grants.md).
- **Decisões pendentes relacionadas:** retenção do `raw_payload`;
  retenção/anonimização de dados pessoais (ver §9).
- **Última revisão:** 2026-07-23.

> Os ADRs são autoritativos. Exemplos abaixo são **conceituais e não
> implementados** — não há migrations nem SQL executável neste projeto ainda.

## 1. Decisão-mãe: uma pessoa = um `contact`

`contacts` é o único registro-pessoa dentro de uma clínica e o único lugar que
guarda dado pessoal (nome, telefone, e-mail). Tudo o mais são papéis, estados e
relacionamentos ([ADR-006](../adr/ADR-006-modelo-de-dominio-pessoa-e-convencoes.md)).

- **Lead não é uma entidade-pessoa paralela.** É um **estado** do contato
  (`lifecycle_stage`) combinado com uma `opportunity` em etapa inicial.
- **`patient` é uma extensão 1:1 de `contact`** (`contact_id` único). Transformar
  lead em paciente cria a linha em `patients` e avança o estágio — **sem copiar
  dado pessoal**.
- Um `contact` pode ter **múltiplas `opportunities`** (recorrência = nova
  oportunidade).

## 2. Relações conceituais

```
clinic (tenant)
 └─ contact (pessoa única; PII aqui)
     ├─ patient (0..1, extensão 1:1)
     ├─ opportunity (0..N)  ── pipeline/stage, status
     │     ├─ quote (0..N) ─ quote_item (1..N)
     │     ├─ appointment (0..N)  [tipo: evaluation | procedure | return]
     │     └─ attribution_touchpoint (0..N)  [first/last, confidence]
     ├─ conversation (0..N) ─ message (append-only)
     └─ activity (append-only)
```

`clinic_id` é o **tenant direto** e está presente em **todas** as entidades de
tenant, como primeira coluna dos índices compostos
([ADR-004](../adr/ADR-004-multitenant-membership-based.md)).

## 3. Entidades do MVP

**Fundação / tenancy & auth:** `clinics`, `profiles` (global, 1:1 com
`auth.users`), `clinic_members`, `roles`, `permissions`, `role_permissions`,
`invitations`, `clinic_features`, `clinic_limits`.

**CRM comercial:** `contacts`, `pipelines`, `pipeline_stages`, `opportunities`,
`lost_reasons`, `activities`, `tasks`.

**Operação:** `patients`, `professionals`, `procedures`, `appointments`, `quotes`,
`quote_items`.

**Mensageria/atribuição (F3+):** `channel_connections`, `webhook_events`,
`conversations`, `messages`, `tracking_links`, `tracking_clicks`,
`attribution_touchpoints`, `conversion_events` (registro).

**Segurança:** `audit_logs`, `support_grants`, `platform_admins`.

## 4. Entidades preparadas, não implementadas

`ad_accounts` / `ad_campaigns` / `ad_sets` / `ads` (sync Meta), `meta_integrations`
(OAuth), `evaluations` (módulo estruturado próprio — no MVP a avaliação é um
`appointment` do tipo `evaluation`), `lead_intake` (captação automática crua).
Ver [ADR-007](../adr/ADR-007-atribuicao-multitouch.md).

## 5. Chaves e relações (conceitual)

- **PK:** `id uuid` em todas (exceto pontes com PK composta, ex.:
  `role_permissions (role, permission)`).
- **FK de tenant:** `clinic_id` → `clinics(id)` em toda entidade de tenant.
- **1:1:** `patients.contact_id` **único**; `profiles.user_id` → `auth.users(id)`.
- **1:N principais:** `opportunities.contact_id`, `messages.conversation_id`,
  `quote_items.quote_id`, `attribution_touchpoints.opportunity_id`.

## 6. Deduplicação e normalização

- **Telefone:** normalização **E.164** no servidor (`phone_normalized`);
  formatação amigável só na interface.
- **E-mail:** `email_normalized` (trim + lowercase).
- **Unique parcial por tenant** (conceitual, não implementado):

```sql
-- ILUSTRATIVO — não é migration
create unique index uq_contacts_clinic_phone
  on contacts (clinic_id, phone_normalized)
  where phone_normalized is not null and deleted_at is null;
```

Permite o mesmo número em clínicas diferentes, mas impede duplicidade dentro da
mesma clínica; respeita soft delete e valores nulos. Fluxo **find-or-create** no
servidor; a unique é a rede final contra corrida
([ADR-006](../adr/ADR-006-modelo-de-dominio-pessoa-e-convencoes.md)). A lógica de
criação/deduplicação é **centralizada** em um único caso de uso de domínio
([module-boundaries](module-boundaries.md)).

## 7. Soft delete, append-only e auditoria

- **Soft delete** (`deleted_at`) em tabelas mutáveis de negócio; **nunca** em
  append-only.
- **Append-only** (sem UPDATE/DELETE): `activities` (timeline de negócio),
  `audit_logs` (auditoria técnica), `messages`, `webhook_events`,
  `conversion_events`.
- **Campos de auditoria** em todas: `created_at`, `updated_at`, `created_by`,
  `updated_by`.

## 8. Entitlements, limites e convenções de dados

- **`clinic_features`** (liga/desliga add-ons: `feature_key`, `enabled`, `config`)
  e **`clinic_limits`** (quotas). Verificação **centralizada** (`hasFeature` /
  `withinLimit`), nunca flags espalhadas (decisão do produto; ver
  [overview](overview.md)).
- **Datas em UTC** no banco; exibição no **timezone (IANA) da clínica**; timezone
  obrigatório por clínica; padrão inicial `America/Sao_Paulo` **não** fixado
  globalmente no código; sem offset fixo de fuso.
- **Locale `pt-BR`, moeda `BRL`**, formatação **centralizada** (não espalhada).
  `quote_items` guardam **snapshot** de preço.
  Base: [ADR-006](../adr/ADR-006-modelo-de-dominio-pessoa-e-convencoes.md).

### Classificação de dados (resumo)

| Classe | Exemplos | Tratamento |
|---|---|---|
| **Pessoal sensível** | corpo de mensagens, telefone, e-mail, nome, `raw_payload` | acesso restrito; **nunca** em logs/Sentry; cifrado em repouso; retenção *pendente* |
| **Identificador técnico** | `clinic_id`, `event_id`, `request_id`, `provider`, `connection_id` | permitido em telemetria |
| **Operacional** | status, estágios, valores de orçamento | RLS por tenant |

Detalhamento completo de classificação/retenção virá em `docs/security/` (Commit 3).

## 9. Decisões pendentes (dados)

- **Retenção do `raw_payload`** dos webhooks (estratégia em camadas).
  *Pendente de decisão antes do uso de dados reais.*
- **Retenção e anonimização de dados pessoais.** *Pendente de decisão antes do uso
  de dados reais.*
