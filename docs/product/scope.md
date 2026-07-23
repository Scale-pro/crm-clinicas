# Produto e Escopo

- **Objetivo:** definir o produto, para quem serve, o que resolve e o que entra
  (ou não) no MVP.
- **Escopo:** visão de produto, personas, problemas resolvidos, escopo do MVP,
  fora do MVP e as fases até o lançamento.
- **ADRs relacionados:** [ADR-001](../adr/ADR-001-hospedagem-vercel.md),
  [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md),
  [ADR-007](../adr/ADR-007-atribuicao-multitouch.md),
  [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md).
- **Decisões pendentes relacionadas:** política final de consentimento e base
  legal por tipo de dado (ver [segurança](../README.md#decisões-pendentes-explícitas)).
- **Última revisão:** 2026-07-23.

> Os ADRs são autoritativos. Este documento explica a aplicação prática das
> decisões de produto; não as substitui.

## 1. Visão do produto

CRM SaaS **multi-tenant** vertical para **clínicas de estética**, que unifica o
funil comercial (captação e conversão de leads) com a operação da clínica
(agenda, atendimento, retorno do paciente). O diferencial é ser desenhado para o
ciclo específico da estética: **lead → avaliação → orçamento → procedimento →
retorno/recorrência**.

**Escala inicial de projeto:** **100 a 500 clínicas ativas**, com crescimento
futuro sem exigir reescrita.

**Promessa central do MVP:** *quando um novo lead manda mensagem para o WhatsApp
da clínica, ele aparece automaticamente no Kanban* (ver
[messaging-attribution](../architecture/messaging-attribution.md) e
[ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md)).

## 2. Posicionamento

- Contra CRMs genéricos: eles não entendem "avaliação", "procedimento", "retorno".
- Contra sistemas de gestão de clínica tradicionais: fortes em operação/financeiro
  e fracos em vendas/pipeline — entramos pela porta comercial.
- **Sweet spot:** clínica de estética pequena/média que investe em tráfego pago e
  perde leads no WhatsApp.

## 3. Personas e tipos de usuário

| Perfil | Papel | Uso |
|---|---|---|
| Superadministrador da plataforma | Opera o SaaS (painel separado) | Diário |
| Proprietário(a) da clínica | Decisor/comprador | Semanal |
| Administrador da clínica | Configuração/gestão | Diário no início |
| Gestor comercial | Cobra resultado do time | Diário |
| **SDR / atendente comercial** | Ponta comercial (usuário intensivo) | Intensivo |
| **Recepcionista** | Operação de agenda (usuário intensivo) | Intensivo |
| Profissional da clínica | Executa procedimento | Pontual |
| *(futuro)* Cargos personalizados | Flexibilidade | — |

O MVP é desenhado **a partir das telas do SDR e da recepcionista** (usuários
intensivos), não a partir do dashboard do dono.

## 4. Problemas resolvidos (priorizados)

1. Lead que some no WhatsApp → centralização + follow-up.
2. Não saber a origem do lead → atribuição de campanha.
3. Agenda desorganizada / no-show → agenda por profissional + confirmação.
4. Sem memória do paciente → histórico unificado (contato → paciente).
5. Dono cego sobre conversão → dashboard simples de funil e receita estimada.
6. Orçamento perdido → orçamento vinculado à oportunidade + follow-up.

## 5. Escopo do MVP

Classificação: 🔵 fundação · 🟢 MVP · 🟡 preparado, não implementado · ⛔ evitar agora.

**Fundação (🔵):** multi-tenant + RLS, autenticação, convites, papéis básicos,
contatos unificados, entitlements/limites por clínica.

**MVP (🟢):**
- CRM comercial: pipeline Kanban, oportunidades, motivo de perda.
- Follow-ups/tarefas com lembrete.
- **WhatsApp inbound** (obrigatório): mensagem → contato → conversa →
  oportunidade → **card no Kanban**, com captura de atribuição desde a primeira
  mensagem.
- Round-robin configurável por clínica.
- Agenda por profissional; procedimentos; profissionais.
- Ficha do paciente (timeline unificada); paciente como extensão 1:1.
- Orçamento simples vinculado à oportunidade.
- **Atribuição de campanha** (diferencial): tracking links, CTWA, touchpoints,
  primeira/última origem, confidence.
- Dashboard básico; painel do superadmin (mínimo).

**Preparado, não implementado (🟡):** integração Meta Ads (OAuth/sync de custo),
**dispatch** de conversões (CAPI), Google Ads, `evaluations` como módulo próprio,
`lead_intake` para captação automática, conversas ricas, cargos personalizados.

**Fora do MVP (⛔ agora):** prontuário clínico avançado, prescrições, assinatura
digital, controle financeiro completo, emissão fiscal, estoque, comissões
complexas, app mobile nativo, IA avançada, automações complexas, relatórios
personalizados, importações massivas, white-label, múltiplas unidades avançadas,
marketplace, microserviços, data warehouse.

## 6. Diferença: WhatsApp e atribuição no MVP

WhatsApp inbound e atribuição **não** ficam "para depois": entram como fase
própria (F3) logo após o CRM comercial (F2). A F3 já **captura e preserva** desde
a primeira mensagem: `referral` do Click-to-WhatsApp, `ctwa_clid`, IDs de anúncio
disponíveis, UTMs, token de correlação, `tracking_click_id`, payload original e o
`attribution_touchpoint` inicial. A F5 **amplia** (sincronização, visualização,
relatórios) sobre dados já coletados — não inicia a captura
([ADR-007](../adr/ADR-007-atribuicao-multitouch.md)).

## 7. Fases até o lançamento

| Fase | Escopo |
|---|---|
| F0 | Fundação técnica, CI, segurança base, governança |
| F1 | Multi-tenant, autenticação e segurança de acesso |
| F2 | CRM comercial e Kanban |
| F3 | WhatsApp inbound (captura de atribuição desde a 1ª mensagem) |
| F4 | Agenda e operação da clínica |
| F5 | Atribuição e rastreamento (ampliação e relatórios) |
| F6 | Dashboard e relatórios |
| F7 | Validação final, hardening e pré-lançamento (gate) |

Detalhe e dependências em [overview](../architecture/overview.md). Segurança é
distribuída por fase; a F7 **comprova**, não inicia
([ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md)).

## 8. Três noções distintas de "MVP"

Para evitar ambiguidade sobre "quando está pronto":

| Termo | Significado | Marco |
|---|---|---|
| **MVP funcional** | As funcionalidades do MVP existem e funcionam em ambiente de teste | Fim da F2/F3 em diante, por fatia |
| **MVP demonstrável** | Fluxo ponta-a-ponta apresentável a um cliente, com dados fictícios | ~Fim da F6 |
| **MVP autorizado para dados reais** | Aprovado no **gate de segurança da F7** | Só após F7 |

**Regra inegociável:** o produto pode ser funcional e demonstrável antes da F7,
mas **nenhuma clínica real opera com dados reais até a aprovação do gate da F7**.
Ambientes anteriores usam apenas dados fictícios, números de WhatsApp de teste,
contas de anúncios de teste (quando possível), clínicas fictícias e usuários
internos autorizados.

## 9. Decisões pendentes (produto)

- **Política final de consentimento e base legal por tipo de dado.**
  *Pendente de decisão antes do uso de dados reais.*
