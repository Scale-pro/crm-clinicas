# CLAUDE.md — Regras operacionais para agentes

Este arquivo resume as **regras operacionais** que todo agente (Claude Code ou
outro) deve seguir neste projeto. Ele **não é a fonte autoritativa** da
arquitetura — os ADRs são. Aqui há apenas o resumo operacional, com links para
as decisões e documentos que os detalham.

> Projeto: CRM SaaS multi-tenant para clínicas de estética. Hospedagem Vercel,
> Supabase/Postgres, Next.js (App Router) + TypeScript, monólito modular por
> domínio.

## Hierarquia das fontes de verdade

Em caso de conflito, vale a ordem abaixo:

1. **ADRs aprovados** (`docs/adr/`) — fonte autoritativa das decisões arquiteturais.
2. **Documentos de arquitetura** (`docs/architecture/`) — como as decisões são aplicadas.
3. **CLAUDE.md** (este arquivo) — regras operacionais resumidas.
4. **AGENTS.md** — orientação para agentes; aponta para este arquivo e para os ADRs.
5. **Testes de invariantes** — comprovam automaticamente as regras críticas.

Regras de conflito:

- **ADR aprovado prevalece.** O código **não pode contradizer** um ADR.
- Se uma mudança exigir contrariar um ADR, **interrompa a mudança e proponha um
  novo ADR** (use `docs/adr/ADR-template.md`). Uma decisão arquitetural **não
  pode ser alterada silenciosamente** durante a implementação.
- Divergência entre este arquivo e um ADR = **o ADR vence**; corrija este arquivo.

## Índice de decisões (ADRs)

- [ADR-001 — Hospedagem Vercel](docs/adr/ADR-001-hospedagem-vercel.md)
- [ADR-002 — Supabase + acesso híbrido / RLS primário](docs/adr/ADR-002-supabase-acesso-hibrido.md)
- [ADR-003 — Monólito modular + convergência de domínio](docs/adr/ADR-003-monolito-modular-e-convergencia-de-dominio.md)
- [ADR-004 — Multi-tenant membership-based](docs/adr/ADR-004-multitenant-membership-based.md)
- [ADR-005 — Superadmin isolado + support_grants](docs/adr/ADR-005-superadmin-isolado-e-support-grants.md)
- [ADR-006 — Modelo de domínio de pessoas e convenções](docs/adr/ADR-006-modelo-de-dominio-pessoa-e-convencoes.md)
- [ADR-007 — Atribuição multi-touch](docs/adr/ADR-007-atribuicao-multitouch.md)
- [ADR-008 — Ingestão assíncrona, adapters, idempotência](docs/adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md)
- [ADR-009 — Fila QStash substituível](docs/adr/ADR-009-fila-qstash-substituivel.md)
- [ADR-010 — Correlação site→WhatsApp por token](docs/adr/ADR-010-correlacao-site-whatsapp.md)
- [ADR-011 — Design system e acessibilidade](docs/adr/ADR-011-design-system-e-acessibilidade.md)
- [ADR-012 — Segurança por fase, invariantes e governança](docs/adr/ADR-012-seguranca-por-fase-e-governanca.md)

## Invariantes inegociáveis

Um agente **nunca** viola estas regras. Se uma tarefa parecer exigir isso, pare e
proponha um ADR.

### Multi-tenant e banco (ADR-002, ADR-004)

- Toda tabela de tenant tem `clinic_id` obrigatório (FK), RLS `enable` + `force`,
  e **políticas separadas** para SELECT/INSERT/UPDATE/DELETE.
- `with check` **impede a alteração de `clinic_id`** em updates/inserts.
- `clinic_id` é a **primeira coluna** de índices compostos de tenant.
- **Nunca** confiar em `clinic_id` vindo do frontend ou de payload externo.
- `clinic_id` ativo é só contexto de navegação/filtro; é **revalidado** contra os
  vínculos reais e **nunca** concede acesso por si só.
- **`service role` só na lista fechada** (cron, webhooks, plataforma agregada,
  migrations/seeds). Fluxos de usuário usam a sessão/JWT.
- Cadastro/convite usam `SECURITY DEFINER` validado, **não** `service role`.

### Funções `SECURITY DEFINER` (ADR-002)

- `search_path` fixo com schemas explícitos; privilégio mínimo; validação
  rigorosa; `EXECUTE` **revogado de `PUBLIC`** e concedido só aos papéis
  necessários.

### Autorização (ADR-004, ADR-011)

- Autorização por **ação/permissão** (`has_permission`), nunca por comparação de
  cargo espalhada.
- Toda operação exige, no servidor: **guard** (sessão + tenant + permissão),
  **validação de campos permitidos** (allowlist/Zod) e **RLS** no banco.
- **`PermissionGate` é apenas UX** (esconder/desabilitar na interface). **Nunca**
  é mecanismo de autorização.

### Domínio, módulos e integrações (ADR-003, ADR-008, ADR-009)

- Módulos se comunicam apenas por sua **interface pública** (`index.ts`); é
  proibido importar internals de outro módulo.
- Banco e fila são acessados por interfaces de `shared/` (`shared/db`,
  `shared/queue`); é **proibido** usar o SDK do Supabase/QStash direto no domínio.
- O domínio **não** conhece o formato de Meta/Evolution; só o evento normalizado
  dos adapters.
- Criação/localização de contato + oportunidade converge para **um único caso de
  uso de domínio**; **proibido** duplicar lógica de criação/deduplicação por
  endpoint (manual, webhook, futuros formulários).
- Escrita sempre com **allowlist de campos** (Zod); **nunca** `insert(body)` cru
  (anti mass assignment).

### Observabilidade, logs e dados pessoais (ADR-012)

- **Nenhuma** ferramenta de monitoramento (ex.: Sentry, logs da Vercel — o
  provedor final de observabilidade ainda é uma decisão pendente) recebe
  automaticamente: corpo de mensagens, telefone completo, e-mail, nome do
  paciente, tokens, cookies, headers de autorização, `raw_payload` do webhook,
  URLs assinadas de arquivos.
- Todo log/erro passa por **sanitização central** antes do envio.
- Identificação técnica permitida: `clinic_id`, `event_id`, `request_id`,
  `provider`, `connection_id`, status do processamento, códigos internos de erro.
- **Nunca** usar `console` direto fora do logger sanitizado de
  `shared/observability`.

### Idempotência e mensagens (ADR-008)

- Reenvio de webhook **nunca** duplica contato, conversa, mensagem ou
  oportunidade.
- O endpoint de ingest só responde 200 **após persistência durável**; nenhum
  evento é perdido silenciosamente.

### Convenções de dados (ADR-006)

- Telefone em **E.164** no domínio; formatação amigável só na interface.
- Datas em **UTC** no banco; exibição no **timezone (IANA) da clínica**; frontend
  não define o horário oficial do agendamento; sem offset fixo de fuso.
- Locale `pt-BR`, moeda `BRL`, formatação **centralizada**.

## Fluxo de trabalho para agentes

1. Antes de mudar arquitetura, leia os ADRs relevantes.
2. Rode e mantenha verdes os testes de invariantes (quando existirem, a partir da F0).
3. Uma decisão arquitetural nova → **novo ADR**, não improviso no código.
4. Toda alteração importante passa por **PR** com o
   [checklist arquitetural e de segurança](.github/pull_request_template.md) e CI
   verde (ver [ADR-012](docs/adr/ADR-012-seguranca-por-fase-e-governanca.md)).

## Escopo atual do projeto

O projeto está na fase de **documentação e governança** (pré-implementação).
Nenhuma aplicação, dependência, integração, migration ou componente foi criada
ainda. Ver o estado e a ordem das fases em [docs/README.md](docs/README.md).
