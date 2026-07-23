# ADR-008: Ingestão assíncrona de mensagens, adapters e idempotência

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** F3
- **Documentos relacionados:** [messaging-attribution](../architecture/messaging-attribution.md) *(Commit 2)*

## Contexto

A promessa central do produto é: "quando um novo lead manda mensagem para o
WhatsApp da clínica, ele aparece automaticamente no Kanban". Provedores (Meta
Cloud API, Evolution API) reenviam webhooks em caso de lentidão/falha. O domínio
do CRM não pode depender do formato de nenhum provedor.

## Decisão

1. **Três estágios com responsabilidades isoladas:**
   - **Ingest:** valida assinatura → persiste o evento cru em `webhook_events`
     de forma idempotente → enfileira → responde 200 rapidamente (ver SLO). O
     endpoint só responde após persistência durável. **Nenhum evento é perdido
     silenciosamente.**
   - **Processor:** executa o pipeline de domínio de forma idempotente e
     transacional (ver ADR-003), convergindo para os mesmos serviços de domínio
     do fluxo manual.
   - **Realtime:** publica a atualização (Supabase Realtime) para Kanban e central
     de conversas.
2. **Adapters por provedor** convertem o payload em um **evento interno comum**
   (`NormalizedInboundMessage`). O domínio conhece apenas o evento normalizado,
   nunca o formato Meta/Evolution. Novos canais implementam a mesma interface.
3. **Resolução de clínica** por `channel_connections` (ex.: `phone_number_id` na
   Cloud API, `instance` na Evolution). **Nunca** confiar em `clinic_id` do
   payload externo.
4. **Idempotência em 5 camadas:** `webhook_events` unique `(provider,
   external_event_id)`; `messages` unique `(clinic_id, provider,
   external_message_id)`; contato por `(clinic_id, phone_normalized)`;
   conversa por `(clinic_id, contact_id, channel)`; oportunidade por verificação
   de "aberta e compatível" + chave de idempotência derivada do evento.
5. **Primeira mensagem cria o card** na etapa inicial do pipeline quando não
   existir oportunidade aberta compatível. Reenvios **nunca** duplicam contato,
   conversa, mensagem ou oportunidade.
6. **SLO decomposto:** `webhook_ingest_duration`, `event_processing_duration`,
   `realtime_publish_duration`, e o SLO principal `webhook_to_opportunity`
   **p95 < 5s / p99 < 15s** (ingest preferencialmente < 1s). Retries aparecem
   **separadamente** em métricas de recuperação, não na latência normal. Atraso
   provedor→webhook não é atribuído ao CRM.
7. Runtime **Node.js** como padrão.

## Consequências

- **Positivas:** idempotência real; troca de provedor sem tocar o domínio;
  nenhum lead perdido em silêncio.
- **Negativas / custos:** exige fila (ADR-009), DLQ, reconciliação e observabilidade.
- **Impacto em testes:** testes de idempotência de webhook (reenvio não duplica) e
  de convergência manual/webhook para o mesmo resultado de domínio.

## Alternativas consideradas

- **Processar tudo síncrono no webhook:** rejeitada — ACK lento causa reenvio e
  reprocessamento parcial/duplicatas.
- **Domínio acoplado ao formato do provedor:** rejeitada — impede troca de
  provedor e mistura responsabilidades.

## Como alterar esta decisão

Novo ADR aprovado.
