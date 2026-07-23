# Runbook — Incidente de segurança

- **Objetivo:** conduzir a resposta a um incidente de segurança de forma
  consistente, preservando evidências e cumprindo obrigações de privacidade.
- **Escopo:** suspeita ou confirmação de acesso indevido, vazamento,
  comprometimento de segredos ou abuso.
- **Responsáveis previstos:** responsável de segurança *(a designar)* (coordena);
  responsável técnico; responsável jurídico/privacidade *(a designar)*; operador
  da plataforma.
- **ADRs relacionados:** [ADR-005](../adr/ADR-005-superadmin-isolado-e-support-grants.md),
  [ADR-004](../adr/ADR-004-multitenant-membership-based.md),
  [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md).
- **Documentos relacionados:** [../security/ssdlc](../security/ssdlc.md),
  [../security/data-classification](../security/data-classification.md),
  [backup-restore](backup-restore.md), [provider-outage](provider-outage.md).
- **Decisões pendentes:** requisitos legais de notificação (prazos/autoridades) —
  a confirmar por jurídico; provedor de observabilidade para detecção.
- **Última revisão:** 2026-07-23.

> **Não há prazos legais inventados neste documento.** Requisitos de notificação
> (ANPD, titulares) **devem ser confirmados por responsável jurídico/privacidade**
> antes da produção.

1. **Objetivo:** conter, investigar, remediar e comunicar um incidente com o menor
   dano possível.
2. **Quando usar:** suspeita/confirmação de acesso cross-tenant, vazamento de
   PII/segredos, sequestro de sessão, webhook forjado com impacto, abuso de support
   grant, dependência comprometida.
3. **Severidade possível:** média a crítica.
4. **Responsável:** responsável de segurança coordena; aciona os demais papéis.
5. **Pré-requisitos:** acesso aos logs sanitizados, à auditoria e aos controles de
   rotação de segredos e revogação de sessões.
6. **Detecção:** alertas de anomalia (picos de erro, tentativas de acesso),
   auditoria, denúncia de clínica, alerta de secret scanning.
7. **Classificação de severidade:** avaliar dado afetado (ver
   [data-classification](../security/data-classification.md)), abrangência
   (uma clínica × várias × plataforma) e se há dado pessoal sensível.
8. **Preservação de evidências:** capturar logs relevantes, auditoria, `event_id`,
   estado afetado — **antes** de alterar; sem expor PII desnecessária.
9. **Contenção:** revogar sessões; **rotacionar segredos** comprometidos;
   **suspender integrações** afetadas; desativar conexões/contas envolvidas;
   bloquear temporariamente operações se necessário.
10. **Investigação:** determinar vetor, escopo e dados afetados; verificar se houve
    exfiltração; reconstituir a linha do tempo.
11. **Recuperação:** corrigir a causa; se necessário, restaurar de backup
    ([backup-restore](backup-restore.md)) e reconciliar
    ([webhook-reconciliation](webhook-reconciliation.md)).
12. **Comunicação interna:** informar operador/stakeholders com fatos e status.
13. **Comunicação às clínicas afetadas:** mensagem clara, sem expor dados de
    terceiros; orientar ações se aplicável.
14. **Avaliação jurídica/privacidade:** **jurídico decide** sobre notificação a
    autoridades/titulares e prazos — *a confirmar antes da produção*.
15. **Postmortem e plano de correção:** causa raiz, ações corretivas com donos e
    datas, melhorias de detecção/prevenção.
16. **Critério de encerramento:** vetor fechado; segredos rotacionados; dados
    íntegros; comunicações feitas; avaliação jurídica concluída; postmortem
    registrado.

## Escalonamento
Crítico/plataforma → aciona todos os papéis imediatamente. Suspeita isolada →
segurança avalia e decide escalar.
