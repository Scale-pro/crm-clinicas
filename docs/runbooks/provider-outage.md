# Runbook — Indisponibilidade de fornecedores

- **Objetivo:** manter o serviço o mais operacional possível e evitar perda de
  eventos durante a queda de um fornecedor, reconciliando ao retorno.
- **Escopo:** indisponibilidade de Supabase, Vercel, QStash, WhatsApp Cloud API,
  Evolution API, Meta Ads, provedor de observabilidade e GitHub/CI durante deploy.
- **Responsáveis previstos:** plantão técnico; operador da plataforma
  (comunicação/decisão de bloquear operações).
- **ADRs relacionados:** [ADR-001](../adr/ADR-001-hospedagem-vercel.md),
  [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md),
  [ADR-009](../adr/ADR-009-fila-qstash-substituivel.md).
- **Documentos relacionados:** [../security/dr](../security/dr.md),
  [../security/shared-responsibility](../security/shared-responsibility.md),
  [webhook-reconciliation](webhook-reconciliation.md), [webhook-dlq](webhook-dlq.md).
- **Decisões pendentes:** provedor de observabilidade; operador do Evolution API.
- **Última revisão:** 2026-07-23.

## Formato

Para cada fornecedor: **o que continua** / **o que degrada** / **detecção** /
**comunicação** / **evitar perda de eventos** / **reconciliar no retorno** /
**quando desativar integração** / **quando bloquear operações**. Os 16 passos do
formato de runbook aplicam-se de forma transversal (detecção→contenção→
recuperação→validação→encerramento).

## 1. Supabase (banco/Auth/Storage/Realtime)
- **Continua:** pouco — é dependência central. Páginas estáticas podem carregar.
- **Degrada:** login, leitura/escrita, Realtime.
- **Detecção:** erros de conexão; status page do Supabase.
- **Comunicação:** informar clínicas de indisponibilidade geral.
- **Evitar perda de eventos:** ingest deve **persistir antes de responder 200**;
  se o banco está fora, o webhook falha e o **provedor reenvia** — não confirmar
  200 sem persistência.
- **Reconciliar:** ao voltar, rodar [webhook-reconciliation](webhook-reconciliation.md).
- **Desativar integração:** não aplicável (é a base).
- **Bloquear operações:** sim, enquanto totalmente indisponível.

## 2. Vercel (execução)
- **Continua:** nada da aplicação (é o host). CDN pode servir estáticos.
- **Degrada:** toda a aplicação.
- **Detecção:** status page da Vercel; monitor externo.
- **Comunicação:** indisponibilidade geral.
- **Evitar perda de eventos:** provedores de WhatsApp reenviam webhooks não
  confirmados; ao voltar, reconciliar.
- **Reconciliar:** reconciliação de webhooks no retorno.
- **Desativar/Bloquear:** não aplicável isoladamente.

## 3. QStash (fila)
- **Continua:** **ingest e Realtime** (a mensagem é persistida no ingest); o que
  para é o **processamento assíncrono**.
- **Degrada:** criação de contato/oportunidade a partir do evento (atrasa).
- **Detecção:** falhas de enfileiramento; backlog; status do Upstash.
- **Comunicação:** avisar que leads podem aparecer com atraso.
- **Evitar perda de eventos:** eventos ficam persistidos em `webhook_events`
  (`pending`); nada se perde. Considerar plano B (cron polling) se prolongado
  ([ADR-009](../adr/ADR-009-fila-qstash-substituivel.md)).
- **Reconciliar:** ao voltar, processar `pending` acumulados (idempotente).
- **Desativar/Bloquear:** não; apenas comunicar atraso.

## 4. WhatsApp Cloud API (oficial)
- **Continua:** todo o CRM, exceto entrada/saída por esse canal.
- **Degrada:** recebimento de mensagens desse canal.
- **Detecção:** ausência de eventos; erros de assinatura; status Meta.
- **Comunicação:** avisar clínicas do canal afetado.
- **Evitar perda de eventos:** dependemos do reenvio da Meta; preservar
  idempotência para reprocessar.
- **Reconciliar:** reconciliação no retorno.
- **Desativar integração:** se enviar payloads inválidos persistentes.
- **Bloquear:** não globalmente; só o canal afetado.

## 5. Evolution API (instância)
- **Continua:** CRM e demais canais.
- **Degrada:** o canal por instância; **atribuição CTWA** já era limitada nesse
  provedor.
- **Detecção:** instância offline; erros de conexão.
- **Comunicação:** avisar clínicas que usam Evolution.
- **Evitar perda de eventos:** conforme garantias do operador *(a validar)*.
- **Reconciliar:** reprocessar eventos preservados.
- **Desativar integração:** **desativar a conexão** problemática
  ([webhook-dlq](webhook-dlq.md)) até estabilizar.
- **Bloquear:** só o canal afetado.

## 6. Meta Ads (enriquecimento/CAPI futuro)
- **Continua:** captura de atribuição (IDs crus são preservados).
- **Degrada:** enriquecimento de nomes/custo e **dispatch** de conversões.
- **Detecção:** falhas de API/sync; status Meta.
- **Comunicação:** interna (impacto em relatórios/otimização).
- **Evitar perda de eventos:** `conversion_events` ficam `pending` para reenvio.
- **Reconciliar:** reprocessar sync/dispatch no retorno, sem perder dados originais.
- **Desativar/Bloquear:** não afeta operação do CRM.

## 7. Provedor de observabilidade (futuro)
- **Continua:** toda a aplicação.
- **Degrada:** visibilidade (logs/erros/métricas).
- **Detecção:** ausência de dados no provedor.
- **Comunicação:** interna.
- **Evitar perda de eventos:** não afeta dados de negócio; aumentar atenção manual.
- **Reconciliar:** retomar envio ao voltar.
- **Desativar/Bloquear:** não.

## 8. GitHub / CI durante deploy
- **Continua:** produção atual (já implantada).
- **Degrada:** capacidade de fazer novos deploys/hotfixes.
- **Detecção:** falhas de CI; status GitHub.
- **Comunicação:** interna; adiar deploys não urgentes.
- **Evitar perda de eventos:** não aplicável a dados.
- **Reconciliar:** retomar pipeline ao voltar.
- **Desativar/Bloquear:** **congelar deploys** até restabelecer (não burlar o CI
  obrigatório).
