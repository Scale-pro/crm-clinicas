# Runbook — Reconciliação de webhooks

- **Objetivo:** localizar e corrigir divergências no pipeline de mensagens para
  garantir que nenhum lead se perca em silêncio.
- **Escopo:** consistência entre `webhook_events`, fila, mensagens, contatos,
  conversas, oportunidades, activities, touchpoints e Realtime.
- **Responsáveis previstos:** plantão técnico.
- **ADRs relacionados:** [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md),
  [ADR-009](../adr/ADR-009-fila-qstash-substituivel.md),
  [ADR-007](../adr/ADR-007-atribuicao-multitouch.md).
- **Documentos relacionados:** [webhook-dlq](webhook-dlq.md),
  [../architecture/messaging-attribution](../architecture/messaging-attribution.md).
- **Decisões pendentes:** cadência da reconciliação automática; provedor de alertas.
- **Última revisão:** 2026-07-23.

1. **Objetivo:** reconciliar o estado do pipeline e reprocessar o que faltou, de
   forma idempotente.
2. **Quando usar:** rotina periódica; após indisponibilidade; após restauração de
   backup; suspeita de eventos presos.
3. **Severidade possível:** média (impacto acumulado se ignorado).
4. **Responsável:** plantão técnico.
5. **Pré-requisitos:** acesso de leitura aos metadados do pipeline; permissão de
   reprocessamento; idempotência garantida no processor.
6. **Como detectar (verificações):**
   - Evento **persistido e não enfileirado**.
   - Evento **pendente por tempo excessivo**.
   - Evento **processado sem mensagem**.
   - **Mensagem sem conversa**.
   - **Mensagem sem contato**.
   - Mensagem que **deveria criar oportunidade** e não criou.
   - **Oportunidade sem `activity` inicial**.
   - **Touchpoint ausente** quando havia `referral`/tracking token.
   - **Falha na publicação Realtime**.
   - **Divergência** entre status da fila e `webhook_events`.
7. **Contenção imediata:** se a origem for uma conexão problemática, desativá-la
   temporariamente ([webhook-dlq](webhook-dlq.md)).
8. **Diagnóstico:** para cada divergência, identificar em qual estágio parou
   (ingest/processor/realtime) usando `event_id` e timestamps dos indicadores do
   SLO decomposto.
9. **Recuperação:** **reenfileirar/reprocessar** por referência ao evento
   (idempotente); recriar publicação Realtime quando o dado já existe no banco;
   completar touchpoint a partir do payload preservado.
10. **Validação:** confirmar que cada indicador voltou a "consistente"; sem
    duplicatas; card visível no Kanban; métricas normalizadas.
11. **Comunicação:** reportar volume e causa se relevante; sem PII.
12. **Evidências a preservar:** lista de `event_id` afetados, tipo de divergência,
    ação, resultado.
13. **Auditoria:** ações de reprocessamento registradas em `audit_logs`.
14. **Escalonamento:** divergência sistêmica (muitos eventos) → engenharia;
    suspeita de perda estrutural → incidente.
15. **Pós-incidente:** ajustar alertas/limiares; corrigir causa raiz no pipeline.
16. **Critério de encerramento:** todas as verificações do item 6 sem pendências;
    fila e `webhook_events` consistentes; evidências registradas.
