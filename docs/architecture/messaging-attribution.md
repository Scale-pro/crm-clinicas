# Mensageria e atribuição

- **Objetivo:** descrever o recebimento de mensagens, o pipeline até o Kanban e a
  atribuição de origem.
- **Escopo:** ingest/processor/realtime, adapters, resolução de clínica,
  idempotência, DLQ/reconciliação, round-robin, CTWA, token site→WhatsApp,
  touchpoints, conversion events, `raw_payload` sensível e o SLO decomposto.
- **ADRs relacionados:** [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md),
  [ADR-009](../adr/ADR-009-fila-qstash-substituivel.md),
  [ADR-010](../adr/ADR-010-correlacao-site-whatsapp.md),
  [ADR-007](../adr/ADR-007-atribuicao-multitouch.md),
  [ADR-003](../adr/ADR-003-monolito-modular-e-convergencia-de-dominio.md).
- **Decisões pendentes relacionadas:** retenção do `raw_payload`.
- **Última revisão:** 2026-07-23.

> Os ADRs são autoritativos. Este documento explica a aplicação prática.

## 1. Arquitetura em três estágios

Um webhook aceita trabalho; não o executa
([ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md)):

- **Ingest** — valida assinatura → persiste o evento cru em `webhook_events` de
  forma idempotente → enfileira → responde 200 **após persistência durável**.
  Nenhum evento é perdido silenciosamente.
- **Processor** — acionado pela fila; executa o pipeline de domínio de forma
  idempotente e transacional, convergindo para os **mesmos serviços de domínio**
  do fluxo manual ([module-boundaries](module-boundaries.md)).
- **Realtime** — publica a atualização (Supabase Realtime) para Kanban e central
  de conversas.

## 2. Evento normalizado e adapters

O domínio **não** conhece o formato de Meta/Evolution — apenas o
`NormalizedInboundMessage`. Cada provedor tem um adapter que
verifica assinatura, faz parse, resolve o canal e extrai `referral`:

- **WhatsApp Cloud API (oficial):** assinatura `X-Hub-Signature-256`; handshake de
  verificação; `referral` nativo em mensagens CTWA; `phone_number_id` resolve a
  clínica.
- **Evolution API (instância):** assinatura/token por instância; `instance`
  resolve a clínica. **Limitação:** `referral`/`ctwa_clid` pode não vir — a
  atribuição CTWA cai para confiança menor ou indisponível nesse provedor.

**Resolução da clínica** sempre por `channel_connections` (identificador confiável
configurado). **Nunca** por `clinic_id` do payload externo.

## 3. Fluxo mensagem → contato → conversa → oportunidade → Kanban

1. Ingest valida e persiste o evento cru (idempotente).
2. Processor: normaliza telefone → **find-or-create `contact`** → find-or-create
   `conversation` → grava `message` (append-only) → verifica `opportunity` aberta
   e compatível → se não houver, cria no **pipeline padrão**, etapa **"Novo lead"**
   → cria `attribution_touchpoint` inicial → cria `activity`
   `lead_in_whatsapp` → aplica **round-robin** (se configurado).
3. Realtime publica → card aparece no Kanban e a conversa na central.

A **primeira mensagem cria o card** quando não existe oportunidade aberta
compatível. Reenvios nunca duplicam contato, conversa, mensagem ou oportunidade.

### Round-robin configurável

Por clínica: **automático (round-robin)** / **pool não atribuído** / **manual**.
No round-robin: só membros ativos e habilitados a receber leads; suspensos/ausentes
ignorados; **atribuição transacional** (sem duplo-atribuir); `activity` registra
qual regra atribuiu; gestores com permissão reatribuem; a clínica pode desativar a
automação. Regras avançadas (carga/horário/procedimento/origem) = depois.

## 4. Idempotência em cinco camadas

1. **Evento:** `webhook_events` unique `(provider, external_event_id)` (dedupe na
   porta).
2. **Mensagem:** `messages` unique `(clinic_id, provider, external_message_id)`.
3. **Contato:** `(clinic_id, phone_normalized)`.
4. **Conversa:** `(clinic_id, contact_id, channel)`.
5. **Oportunidade:** verificação "aberta e compatível" + chave de idempotência
   derivada do evento.

Todo o pipeline roda em transação; ao final marca `webhook_events` como
processado.

## 5. Fila, retry, DLQ e reconciliação

- **QStash/Upstash atrás de `shared/queue`** (substituível), com retry/backoff e
  DLQ ([ADR-009](../adr/ADR-009-fila-qstash-substituivel.md)).
- **DLQ:** após N tentativas, evento marcado como `dead` + alerta. Fluxo
  operacional (ver runbook, Commit 3): ver só metadados seguros, motivo da falha,
  reprocessar/cancelar idempotente, registrar quem agiu, sem editar o payload,
  contador de tentativas, desativar conexão problemática.
- **Reconciliação periódica** localiza: pendentes por tempo excessivo; persistidos
  não enfileirados; mensagem sem oportunidade quando deveria gerar; processado sem
  `activity`; falha de publicação Realtime.

## 6. Atribuição de origem

Multi-touch, **por oportunidade e touchpoint** (não campo `source`)
([ADR-007](../adr/ADR-007-atribuicao-multitouch.md)):

- **CTWA (Click-to-WhatsApp):** a primeira mensagem traz o objeto `referral` com
  `ctwa_clid`, `source_id/type/url`, headline/body, IDs de anúncio, etc. —
  **determinístico, alta confiança**. Preservamos o `referral` cru.
- **Site → WhatsApp:** correlação por **token natural** no texto pré-preenchido
  (ex.: "Olá, gostaria de saber mais... Ref.: ABC123"): curto, não sequencial,
  sem PII/campanha, associado ao `tracking_click` no servidor, com validade e uso
  único; token válido → **alta confiança**. **Fallback temporal** só como fallback,
  **confiança baixa/média**. Uma atribuição probabilística **nunca** é apresentada
  como certeza ([ADR-010](../adr/ADR-010-correlacao-site-whatsapp.md)).
- **`tracking_links`** (links do CRM) e **`tracking_clicks`** (UTMs, `fbclid`,
  referrer, UA/IP quando permitidos, `tracking_id`).
- Cada `attribution_touchpoint` guarda **first_touch/last_touch** e **confidence**,
  ligando contato/oportunidade/conversa/mensagem inicial/clique/plataforma/campanha.
- O CRM mostra **primeira origem, última origem e confiança**. Uma nova
  oportunidade de um contato antigo pode ter atribuição diferente.
- **`conversion_events`** registram etapas (lead recebido, qualificado, avaliação
  agendada/realizada, orçamento enviado, venda + valor) — **registro no MVP**;
  **dispatch** para a Meta (CAPI) e enriquecimento de IDs = depois, **sem perder**
  os dados originais.

## 7. `raw_payload` como dado sensível

Pode conter telefone, nome, conteúdo de mensagens, referências de mídia, dados de
campanha e metadados técnicos. Portanto: acesso extremamente restrito; **proibido**
enviar a Sentry/logs; cifrado em repouso; separação entre metadados de idempotência
e conteúdo pessoal; proibido guardar segredos vazados no payload; reprocessamento
por **referência ao evento**, sem expor o conteúdo integral na interface
administrativa. Retenção em camadas — *pendente* (§9).

## 8. SLO decomposto

Indicadores:

- `webhook_ingest_duration` — recebimento → persistência durável.
- `event_processing_duration` — persistência → criação de mensagem/contato/
  conversa/oportunidade.
- `realtime_publish_duration` — commit da oportunidade → publicação Realtime.
- **`webhook_to_opportunity`** (principal) — recebimento → oportunidade persistida.

Metas: **`webhook_to_opportunity` p95 < 5s / p99 < 15s**; ingest preferencialmente
**< 1s**. Eventos com **retry** aparecem **separadamente** em métricas de
recuperação, não na latência normal.

A garantia é: (1) oportunidade criada no banco, (2) evento Realtime publicado, (3)
uma interface conectada consegue recebê-lo — **não** se usa apenas `card_visible_at`
(a UI pode estar fechada/desconectada). **O tempo entre o usuário enviar a mensagem
e o provedor entregar o webhook está FORA do SLO do CRM** (fora do nosso controle).

### Alertas relacionados

Evento em DLQ (crítico); evento preso (`pending` > N min); `webhook_failed` acima
do baseline; assinatura inválida recorrente por conexão; `webhook_to_opportunity`
p95 estourando o SLO. Nenhum lead perdido em silêncio.

## 9. Decisões pendentes (mensageria/atribuição)

- **Retenção do `raw_payload`** (estratégia em camadas: integral por período
  curto → minimizado/cifrado → só identificadores de idempotência/auditoria →
  exclusão/anonimização). *Pendente de decisão antes do uso de dados reais.*
