# ADR-009: Fila gerenciada (QStash/Upstash) atrás de interface substituível

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** F3
- **Documentos relacionados:** [overview](../architecture/overview.md), [webhook-dlq](../runbooks/webhook-dlq.md) *(Commits 2/3)*

## Contexto

Na Vercel não há workers persistentes. A fase de WhatsApp aciona, de forma
controlada, a necessidade de trabalho assíncrono confiável (retry, DLQ) que não
pode bloquear o recebimento de mensagens. A fila é infraestrutura e não deve
acoplar as regras de domínio.

## Decisão

1. Usaremos **QStash (Upstash)** como fila gerenciada compatível com serverless
   na fase de WhatsApp, com **retry e backoff** nativos e **dead-letter queue**.
2. A fila fica **atrás de uma interface** (`shared/queue`). O domínio depende da
   abstração, **nunca** do SDK do QStash. A fila pode ser substituída no futuro
   sem alterar regras de domínio. **É proibido** acessar o SDK da fila fora de
   `shared/queue`.
3. A fila é usada para: processamento dos webhooks; retentativas após falhas;
   dead-letter queue; envio futuro de conversões para a Meta; processos
   assíncronos que não devem bloquear o recebimento das mensagens.
4. **DLQ + reconciliação** garantem que nenhum evento se perca. Há um fluxo
   operacional de DLQ (ver runbook, Commit 3): ver apenas metadados seguros,
   consultar motivo da falha, reprocessar/cancelar de forma idempotente,
   registrar quem agiu, sem editar o payload original, com contador de tentativas
   e capacidade de desativar temporariamente uma conexão problemática.
5. **Segurança do QStash** (assinatura/autenticação das chamadas ao processor) é
   requisito da F3.

## Consequências

- **Positivas:** entrega confiável em serverless; substituibilidade; retry/DLQ
  prontos.
- **Negativas / custos:** mais um serviço externo; exige a abstração e sua
  disciplina.
- **Impacto em testes:** teste de arquitetura que detecta uso do SDK da fila fora
  de `shared/queue`; testes de idempotência sob retry.

## Alternativas consideradas

- **Tabela `jobs` + Vercel Cron (polling):** considerada como plano B; rejeitada
  para o caminho principal por latência (intervalo do cron) e por exigir
  reimplementar retry/backoff/DLQ. A abstração permite adotá-la depois, se
  necessário.
- **Processamento síncrono:** rejeitada (ver ADR-008).

## Como alterar esta decisão

Novo ADR aprovado. Trocar de provedor de fila é possível **sem** novo ADR desde
que a interface `shared/queue` e as garantias (retry/DLQ/idempotência) sejam
mantidas; trocar as garantias exige ADR.
