# ADR-011: Design system (shadcn/ui + Tailwind + Radix) e acessibilidade

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** F0 (primitivas) / transversal (telas)
- **Documentos relacionados:** [ui-and-navigation](../architecture/ui-and-navigation.md) *(Commit 2)*

## Contexto

Tailwind sozinho não é um design system. Precisamos de componentes consistentes,
acessíveis e de propriedade do projeto (não dependência de runtime que possa
sumir), e de padrões que impeçam agentes diferentes de reinventarem cada
componente. A interface precisa servir SDR e recepcionista (usuários intensivos),
em desktop e celular.

## Decisão

1. **Design system:** **shadcn/ui + Tailwind + Radix**. Os componentes ficam no
   repositório (código próprio), com acessibilidade via Radix.
2. **Componentes padronizados em `shared/ui`** desde o início: Button, Input,
   Select, Dialog, Drawer, Toast, Badge, Avatar, Tabs, DropdownMenu, Tooltip,
   Skeleton, DataTable, KanbanBoard/KanbanCard, ContactCard, ActivityTimeline,
   AppointmentSlot, EmptyState, **PermissionGate**, **ConfidenceBadge**,
   **SupportModeBanner**. Formatação de telefone/data/moeda centralizada
   (mesma normalização do domínio — ver ADR-006).
3. **`PermissionGate` é apenas UX** (esconder/desabilitar ações). **Nunca** é
   mecanismo de autorização. Toda operação continua exigindo guard no servidor,
   verificação de permissão, validação de tenant, RLS e validação de campos
   permitidos (ver ADR-002/004 e CLAUDE.md).
4. **Acessibilidade e responsividade fazem parte da Definition of Done das
   telas** (não ficam para depois):
   - Navegação por teclado; estados de foco visíveis; labels acessíveis em
     formulários; contraste adequado; componentes Radix configurados corretamente.
   - **Kanban utilizável sem depender exclusivamente de drag-and-drop** —
     alternativa por menu para mover cards.
   - Interface responsiva para desktop, tablet e celular. Conversas e Kanban
     priorizados no desktop, mas **operacionais no celular**.
   - Estados de **loading, erro, vazio, offline e reconexão do Realtime**
     padronizados.

## Consequências

- **Positivas:** consistência entre telas e entre agentes; acessibilidade desde o
  início; propriedade do código dos componentes.
- **Negativas / custos:** exige manter a biblioteca de componentes e checar
  acessibilidade em cada tela.
- **Impacto em testes:** a11y como critério de DoD das telas; PermissionGate
  coberto por testes de autorização **no servidor** (não confiar no gate).

## Alternativas consideradas

- **MUI/Chakra:** rejeitadas — acoplam mais e reduzem o controle do código.
- **Tailwind puro sem sistema de componentes:** rejeitada — leva a padrões
  divergentes.

## Como alterar esta decisão

Novo ADR aprovado.
