# Runbook — DLQ de webhooks

- **Objetivo:** tratar eventos que caíram na dead-letter queue sem perder dados
  nem duplicar processamento.
- **Escopo:** eventos em DLQ do pipeline de ingestão de mensagens.
- **Responsáveis previstos:** plantão técnico; responsável de segurança *(a
  designar)* se houver suspeita de abuso.
- **ADRs relacionados:** [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md),
  [ADR-009](../adr/ADR-009-fila-qstash-substituivel.md).
- **Documentos relacionados:** [webhook-reconciliation](webhook-reconciliation.md),
  [../architecture/messaging-attribution](../architecture/messaging-attribution.md),
  [../security/data-classification](../security/data-classification.md).
- **Decisões pendentes:** provedor de observabilidade (alertas).
- **Última revisão:** 2026-07-23.

1. **Objetivo:** recuperar eventos em DLQ de forma idempotente e auditável.
2. **Quando usar:** alerta de evento em DLQ; falha recorrente de processamento.
3. **Severidade possível:** média a alta (lead pode não ter entrado no Kanban).
4. **Responsável:** plantão técnico; escalar a segurança se suspeita de forja/abuso.
5. **Pré-requisitos:** acesso ao painel operacional; permissão para reprocessar;
   entender que o **payload é sensível** (acesso controlado).
6. **Como detectar:** alerta de `status='dead'`; contador de DLQ; falhas repetidas
   por conexão.
7. **Contenção imediata:** se a falha for por conexão específica, **desativar
   temporariamente a conexão** para parar novas falhas; nenhum evento é descartado.
8. **Diagnóstico:** consultar **apenas metadados seguros** do evento (`event_id`,
   `provider`, `connection_id`, status, tentativas, motivo da falha). Acesso ao
   **payload** é **controlado e auditado**, nunca exibido integralmente na
   interface administrativa; reprocessar **por referência ao evento**.
9. **Recuperação:** **reprocessar** o evento (idempotente — não duplica
   contato/conversa/mensagem/oportunidade); ou **cancelar** o reprocessamento com
   justificativa. Nunca **editar o payload original**.
10. **Validação:** confirmar que a mensagem/oportunidade foi criada; card no
    Kanban; `activity` e `touchpoint` presentes; contador de tentativas coerente.
11. **Comunicação:** informar responsável da clínica apenas se houve impacto
    perceptível; sem expor conteúdo pessoal.
12. **Evidências a preservar:** `event_id`, motivo da falha, ação tomada, quem
    executou, horário, resultado.
13. **Auditoria:** toda ação manual (reprocessar/cancelar/desativar conexão) é
    registrada em `audit_logs` com autor e motivo.
14. **Escalonamento:** falha recorrente no mesmo evento → engenharia; suspeita de
    payload forjado/abuso → segurança.
15. **Pós-incidente:** identificar causa raiz (formato do provedor? bug do
    processor? conexão?); abrir correção se necessário.
16. **Critério de encerramento:** evento processado com sucesso **ou** cancelado
    com justificativa registrada; conexão reativada se aplicável; DLQ sem itens
    pendentes desse evento.
