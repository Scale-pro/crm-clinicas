# Continuidade e recuperação de desastre (DR)

- **Objetivo:** definir a estratégia de continuidade e recuperação sem fixar
  valores finais ainda não aprovados.
- **Escopo:** cenários de desastre, dependências críticas, backup, restauração,
  reconciliação, comunicação, papéis, testes e opções de RPO/RTO/retenção.
- **Responsáveis previstos:** responsável técnico (executa restauração);
  responsável de segurança *(a designar)*; operador da plataforma (decisão de
  declarar/encerrar incidente).
- **ADRs relacionados:** [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md),
  [ADR-009](../adr/ADR-009-fila-qstash-substituivel.md).
- **Documentos relacionados:** [../runbooks/backup-restore](../runbooks/backup-restore.md),
  [../runbooks/provider-outage](../runbooks/provider-outage.md),
  [../runbooks/webhook-reconciliation](../runbooks/webhook-reconciliation.md),
  [shared-responsibility](shared-responsibility.md).
- **Decisões pendentes:** RPO, RTO, frequência de testes, retenção de backups.
- **Última revisão:** 2026-07-23.

> **Backup configurado não é suficiente.** Um backup só é considerado válido após
> um **teste real de restauração** ([backup-restore](../runbooks/backup-restore.md)).
> **PITR** é **requisito a validar no plano contratado** antes da produção — não
> presumir como ativo.

## 1. Cenários de desastre

- Perda/corrupção de dados no Postgres (Supabase).
- Indisponibilidade prolongada de um fornecedor (Supabase/Vercel/QStash/WhatsApp).
- Exclusão acidental em massa; migration destrutiva.
- Comprometimento de segurança exigindo restauração a um ponto anterior.
- Perda de eventos de webhook durante uma indisponibilidade.

## 2. Dependências críticas

Postgres (Supabase) — estado do negócio; Supabase Auth — acesso; QStash — fila de
processamento; provedores de WhatsApp — entrada de mensagens; Vercel — execução.
Detalhe por fornecedor em [provider-outage](../runbooks/provider-outage.md).

## 3. Estratégia de backup

- Backups gerenciados do Supabase + **PITR** *(a validar no plano)*.
- Backups tratados com a **classe do dado mais sensível** que contêm
  ([data-classification](data-classification.md)).
- Frequência e retenção: *pendentes* (ver §9).

## 4. Restauração

Procedimento operacional completo em
[backup-restore](../runbooks/backup-restore.md). Princípios:
- Restaurar primeiro em **ambiente isolado**; validar antes de promover.
- Validar **RLS**, **memberships**, integridade de mensagens/oportunidades/audit
  logs, e **teste cross-tenant** pós-restauração.

## 5. Reconciliação após restauração

- Reprocessar/reconciliar **eventos de webhook** posteriores ao ponto restaurado
  ([webhook-reconciliation](../runbooks/webhook-reconciliation.md)).
- Verificar **integridade dos webhooks** (nenhum evento perdido; idempotência
  garante reprocessamento seguro).
- Conferir divergências entre estado da fila e `webhook_events`.

## 6. Comunicação

- Notificar clínicas afetadas conforme gravidade (canal e responsável definidos
  no plano de incidentes — [security-incident](../runbooks/security-incident.md)).
- Status interno e externo alinhados; sem expor dados pessoais na comunicação.

## 7. Papéis e responsabilidades

| Papel | Responsabilidade |
|---|---|
| Responsável técnico | Executa restauração e reconciliação |
| Responsável de segurança *(a designar)* | Avalia causa/segurança; coordena rotação de segredos se aplicável |
| Operador da plataforma | Declara incidente; aprova retorno à produção |
| Jurídico/privacidade *(a designar)* | Avalia obrigações LGPD quando há dados pessoais |

## 8. Testes e encerramento

- **Testes periódicos** de restauração (frequência *pendente*), com **registro de
  evidências**.
- **Critérios para declarar incidente encerrado:** serviço restabelecido; dados
  íntegros e reconciliados; validações (RLS/cross-tenant/logins) OK; causa
  identificada; ações de follow-up registradas.

## 9. Opções de RPO / RTO / testes / retenção (valores finais pendentes)

Apresentadas como **opções** — os valores finais permanecem **pendentes até
aprovação explícita**.

| Variável | Opção | Benefício | Risco | Custo | Complexidade | Recomendação preliminar |
|---|---|---|---|---|---|---|
| **RPO** | ~24h (backup diário) | Simples/barato | Perde até 1 dia | Baixo | Baixa | Insuficiente com WhatsApp ativo |
| | Minutos (PITR) | Baixa perda | — | Médio (plano) | Média | **Preferível** se PITR confirmado |
| | Quase zero (replicação) | Perda mínima | — | Alto | Alta | Provavelmente exagero para a escala |
| **RTO** | Horas | Aceitável no início | Indisponibilidade maior | Baixo | Baixa | Possível para piloto |
| | ~1h | Bom equilíbrio | — | Médio | Média | **Alvo preliminar** a validar |
| | Minutos | Ótimo | — | Alto | Alta | Não justificado agora |
| **Freq. de teste de restauração** | Trimestral | Menos esforço | Detecção tardia | Baixo | Baixa | Mínimo aceitável |
| | Mensal | Boa confiança | — | Médio | Média | **Recomendado** a validar |
| **Retenção de backups** | Curta | Barato/menos exposição | Menos janela de recuperação | Baixo | Baixa | Avaliar vs. LGPD |
| | Média | Equilíbrio | — | Médio | Baixa | **A definir com jurídico** |

**Status:** RPO, RTO, frequência de testes e retenção de backups —
*Pendente de decisão antes do uso de dados reais.*
