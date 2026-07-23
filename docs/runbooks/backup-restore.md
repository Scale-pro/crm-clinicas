# Runbook — Backup e restauração

- **Objetivo:** executar e validar uma restauração de forma segura, comprovando
  que os backups são efetivamente utilizáveis.
- **Escopo:** solicitação/execução de restauração, validação de integridade e
  aprovação para retorno à produção.
- **Responsáveis previstos:** responsável técnico (executa); operador da
  plataforma (aprova retorno); responsável de segurança *(a designar)* se a
  restauração decorre de incidente.
- **ADRs relacionados:** [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-004](../adr/ADR-004-multitenant-membership-based.md).
- **Documentos relacionados:** [../security/dr](../security/dr.md),
  [webhook-reconciliation](webhook-reconciliation.md),
  [security-incident](security-incident.md).
- **Decisões pendentes:** RPO, RTO, frequência de teste e retenção de backups;
  confirmação de PITR no plano contratado.
- **Última revisão:** 2026-07-23.

> **PITR é requisito a validar no plano contratado** antes da produção. Um backup
> só é considerado válido **após um teste real de restauração**.

1. **Objetivo:** restaurar dados a um ponto íntegro e validar antes de qualquer
   uso em produção.
2. **Quando usar:** perda/corrupção de dados; migration destrutiva; teste
   periódico de restauração; recuperação pós-incidente.
3. **Severidade possível:** alta a crítica (dados em risco).
4. **Responsável:** responsável técnico executa; operador aprova retorno.
5. **Pré-requisitos:** acesso ao mecanismo de backup/PITR *(a validar no plano)*;
   ambiente **isolado** de teste; ponto de restauração escolhido.
6. **Como detectar a necessidade:** alerta de corrupção/perda; solicitação de
   incidente; cronograma de teste.
7. **Contenção imediata:** se em produção, avaliar congelar escritas na área
   afetada para não agravar; comunicar stakeholders.
8. **Diagnóstico:** identificar ponto de restauração adequado (antes do evento) e
   escopo (total × parcial).
9. **Recuperação (procedimento):**
   - Solicitar/iniciar a restauração para um **ambiente isolado** (nunca sobrescrever
     produção diretamente sem validação).
   - Aguardar conclusão e registrar o ponto restaurado.
10. **Validação (obrigatória antes de promover):**
    - Verificação de **integridade** dos dados.
    - **RLS** habilitado/forçado após restauração.
    - **Memberships** (`clinic_members`) íntegros.
    - **Mensagens, oportunidades e audit logs** consistentes.
    - **Reconciliação de webhooks** posteriores ao ponto restaurado
      ([webhook-reconciliation](webhook-reconciliation.md)).
    - **Teste de login** funcional.
    - **Teste cross-tenant** (isolamento preservado).
11. **Comunicação:** informar status e janela; sem expor PII.
12. **Evidências a preservar:** ponto restaurado, resultados das validações, quem
    executou, horário, aprovação.
13. **Auditoria:** restauração e aprovação registradas.
14. **Escalonamento:** falha de integridade ou de isolamento pós-restauração →
    incidente ([security-incident](security-incident.md)).
15. **Pós-incidente:** registrar aprendizado; ajustar frequência de teste se
    necessário; atualizar [dr](../security/dr.md) se a estratégia mudar.
16. **Critério de encerramento:** todas as validações do item 10 OK; **aprovação
    explícita antes de voltar à produção**; evidências arquivadas.
