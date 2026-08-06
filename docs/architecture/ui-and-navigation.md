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
- **Última revisão:** 2026-08-05.

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

## 9. Telas de operação diária (F4 — entregue)

Três rotas do painel da clínica cobrem a operação do dia. Todas leem o mesmo
carregamento (`_agenda/agenda-data.ts`) e derivam do mesmo núcleo puro
(`_agenda/agenda-view-model.ts`), testado em separado.

| Rota | Tela | O que mostra |
|---|---|---|
| `/app/today` | **Hoje** | Indicadores do dia, próximos atendimentos, o que precisa de atenção, resumo por hora e desempenho por profissional |
| `/app/agenda` | **Agenda** | Grade dia × profissional, navegação por dia, marcação em três passos e painel de detalhe com as ações da recepção |
| `/app/financeiro` | **Financeiro** | Faturamento previsto, recebido, a receber, ticket médio e últimos recebimentos do mês |

Regras que estas telas aplicam:

- **Fuso.** O "hoje" é o dia civil da clínica, nunca o do servidor nem o do
  navegador. O horário escolhido na interface trafega como dia civil + `HH:MM`
  locais e só vira instante UTC **no servidor**, com o timezone da clínica
  ([ADR-006](../adr/ADR-006-modelo-de-dominio-pessoa-e-convencoes.md)).
- **Escrita.** Marcar, remarcar e mudar status passam por Server Action fina →
  contrato público de `modules/scheduling` → RPC autorizada com AAL2. A tela
  esconde botões sem permissão apenas por conforto; o controle é do servidor
  ([ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-004](../adr/ADR-004-multitenant-membership-based.md)).
- **Convergência.** Cadastrar um cliente durante a marcação chama o **mesmo**
  caso de uso de criação de contato do CRM. Não existe segunda porta de entrada
  de pessoas ([ADR-003](../adr/ADR-003-monolito-modular-e-convergencia-de-dominio.md)).
- **Preço e duração** são congelados no agendamento: mudança posterior no
  catálogo não reprecifica o passado.
- **Teclado.** Cada agendamento da grade é um `<button>`; a agenda é operável
  sem arrastar, e o dia inteiro também existe como lista cronológica.
- **Nada é truncado.** Nome do cliente e procedimento aparecem por inteiro em
  qualquer duração: a grade é elástica (faixas de 5 min em
  `minmax(proporção, auto)`, régua e colunas em `subgrid`), então texto que não
  cabe estica a faixa em vez de ser cortado. A duração também vem escrita no
  bloco ("60′"), somada à altura proporcional — a altura é reforço, não a única
  leitura. Medido no harness visual, não julgado por screenshot
  ([runbook](../runbooks/visual-harness.md)).
- **Cancelado fora da grade.** Cancelado não ocupa horário, e por isso sai da
  grade — mas não some: vai para a faixa "Cancelados hoje — não ocupam
  horário", abaixo do dia, de onde ainda abre o painel de detalhe.
- **Ações rápidas contextuais.** O painel oferece exatamente as transições de
  status que a escrita aceita a partir do status atual — não um trio fixo. A
  lista é derivada das regras que a RPC `update_appointment_status` já impõe
  (destino no enum, mesmo status é no-op, cancelado é terminal); o domínio não
  define grafo de progressão, e a tela não inventa um. Se algum dia existir uma
  ordem obrigatória entre status, ela nasce no domínio por ADR, não aqui.
- **Gráfico.** Desenhado em SVG próprio, sem biblioteca de terceiros, e sempre
  acompanhado da tabela equivalente para leitor de tela.

### Fronteira do Financeiro

A tela Financeiro é **relatório derivado da agenda**, não um módulo financeiro:
faturamento é o que está marcado, recebido é o que está pago, a receber é a
diferença. Não há lançamento manual, despesa, forma de pagamento nem conciliação
— isso seria domínio novo e entra por ADR, não por tela. A interface diz isso
explicitamente em vez de exibir um total de despesas zerado que passaria por
informação. A ressalva da seção 5 ("não copiar financeiro/fiscal") segue válida
para o domínio; o que existe aqui é leitura dos próprios agendamentos.

## 10. Decisões pendentes (UI)

Nenhuma decisão de UI pendente registrada até aqui.
