# UI e navegação

- **Objetivo:** definir a navegação do MVP, a ordem das telas, o design system e
  os critérios de acessibilidade/responsividade.
- **Escopo:** navegação enxuta, telas por perfil, primeiro fluxo vertical,
  referências visuais, design system, estados de UI, responsividade,
  acessibilidade e componentes transversais.
- **ADRs relacionados:** [ADR-011](../adr/ADR-011-design-system-e-acessibilidade.md),
  [ADR-005](../adr/ADR-005-superadmin-isolado-e-support-grants.md),
  [ADR-007](../adr/ADR-007-atribuicao-multitouch.md).
- **Decisões pendentes relacionadas:** nenhuma específica de UI.
- **Última revisão:** 2026-07-23.

> Os ADRs são autoritativos. Aqui está a aplicação prática.

## 1. Navegação enxuta do MVP

Sidebar do **painel da clínica** (`/(clinic)`):

1. **Conversas** (central de WhatsApp — caixa de entrada do SDR)
2. **Kanban** (pipeline/oportunidades)
3. **Contatos** (lista + ficha unificada)
4. **Agenda** (por profissional)
5. **Relatórios** (dashboard básico)
6. **Configurações** (equipe, procedimentos, profissionais, conexões,
   distribuição, features)

Orçamentos vivem dentro da oportunidade/ficha; avaliações dentro da
agenda/oportunidade. O **painel do superadmin** (`/(platform)`) é aplicação
separada, nunca item da sidebar da clínica
([ADR-005](../adr/ADR-005-superadmin-isolado-e-support-grants.md)).

## 2. Ordem das telas

1. Login / recuperação de senha / MFA (F1)
2. Onboarding: criar clínica + owner (F1)
3. Shell da aplicação (layout, sidebar, seletor de **clínica ativa** revalidado) (F1)
4. Configurações → Equipe (convites/aceite, papéis) (F1)
5. Kanban do pipeline (F2)
6. Ficha do contato/oportunidade (timeline de `activities`, tarefas) (F2)
7. Contatos (lista + busca + dedupe na criação) (F2)
8. Conversas (central WhatsApp + realtime) (F3)
9. Configurações → Conexões WhatsApp + Distribuição (F3)
10. Agenda (F4); Relatórios (F6)
11. Painel superadmin (mínimo, isolado) — transversal

## 3. Fluxos por perfil (resumo)

- **SDR:** Conversas → responder → qualificar → mover card no Kanban → agendar
  avaliação → follow-up.
- **Recepcionista:** Agenda → marcar/remarcar → confirmar presença/check-in.
- **Gestor comercial:** Kanban + Relatórios → conversão, follow-ups atrasados,
  reatribuição.
- **Profissional:** Agenda própria → ficha do paciente que vai atender.
- **Proprietário/Admin:** Relatórios + Configurações.

## 4. Primeiro fluxo vertical

**"Do login ao card no Kanban, manualmente":** login → cria clínica → cria contato
(com dedupe) → o sistema cria oportunidade na etapa "Novo lead" → card aparece no
Kanban → move o card de etapa → `activity` registra a mudança — tudo isolado por
`clinic_id` via RLS, com teste de isolamento verde. É a tubulação que a F3
(WhatsApp) depois automatiza, reutilizando o **mesmo caso de uso de domínio**
([module-boundaries](module-boundaries.md)).

## 5. Referências visuais — o que aproveitar / não copiar

| Referência | Aproveitar | Não copiar |
|---|---|---|
| Kommo | Pipeline Kanban, card resumido, conversa ao lado do card, timeline | Identidade visual; excesso de funções |
| Google Calendar | Grade por profissional, dia/semana, drag para remarcar | Recorrência avançada |
| Calendly | Fluxo limpo de seleção de horário e confirmação | Auto-agendamento público |
| Gestão de clínica (Belle/Feegow) | Ficha do paciente consolidada, status de presença | Prontuário/financeiro/fiscal |

## 6. Design system

**shadcn/ui + Tailwind + Radix** (código próprio no repositório)
([ADR-011](../adr/ADR-011-design-system-e-acessibilidade.md)). Componentes
compartilhados em `shared/ui`: primitivos (Button, Input, Select, Dialog, Drawer,
Toast, Badge, Avatar, Tabs, DropdownMenu, Tooltip, Skeleton, DataTable) e de
domínio (KanbanBoard/KanbanCard, ContactCard, ActivityTimeline, AppointmentSlot,
EmptyState). Formatação de telefone/data/moeda **centralizada** (mesma
normalização do domínio).

Componentes transversais de segurança/atribuição:
- **PermissionGate** — só UX (esconder/desabilitar). **Nunca** autorização.
- **SupportModeBanner** — aviso visual obrigatório de operação sob support grant
  ([ADR-005](../adr/ADR-005-superadmin-isolado-e-support-grants.md)).
- **ConfidenceBadge** — nível de confiança da atribuição, reutilizado em toda
  origem ([ADR-007](../adr/ADR-007-atribuicao-multitouch.md)).

## 7. Estados de UI padronizados

Todos os fluxos padronizam: **loading**, **vazio**, **erro**, **offline** e
**reconexão do Realtime** (especialmente Conversas e Kanban, que dependem de
tempo real).

## 8. Responsividade e acessibilidade

Fazem parte da **Definition of Done das telas** (não ficam para depois):

- Navegação por teclado; **estados de foco visíveis**; labels acessíveis em
  formulários; contraste adequado; componentes Radix configurados corretamente.
- **Kanban utilizável sem depender exclusivamente de drag-and-drop** — alternativa
  por **menu** para mover cards.
- Responsivo para desktop, tablet e celular. Conversas e Kanban priorizados no
  desktop, mas **operacionais no celular**.

### Critérios de aceite (principais telas)

| Tela | Acessibilidade | Responsividade |
|---|---|---|
| **Kanban** | Mover card por teclado e por menu (não só drag); foco visível nos cards; anúncio de mudança de etapa | Colunas roláveis; card legível no celular; ação de mover acessível no toque |
| **Conversas** | Navegação por teclado entre conversas/mensagens; região "ao vivo" para novas mensagens; estados offline/reconexão claros | Lista + thread utilizáveis no celular; envio acessível |
| **Agenda** | Navegação por teclado na grade; foco em slots; labels de horário/profissional | Grade legível em tablet; ações de marcar/remarcar no toque |
| **Formulários (contato/orçamento)** | Labels associadas, mensagens de erro acessíveis, ordem de foco lógica | Campos e botões utilizáveis no celular |
| **Ficha do contato** | Timeline navegável por teclado; foco em ações | Layout coluna única no celular |

## 9. Decisões pendentes (UI)

Nenhuma decisão de UI pendente registrada até aqui.
