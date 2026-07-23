# ADR-001: Hospedagem na Vercel

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** transversal
- **Documentos relacionados:** [overview](../architecture/overview.md) *(Commit 2)*

## Contexto

O produto é um CRM SaaS multi-tenant para clínicas de estética, projetado para
100–500 clínicas ativas com crescimento futuro sem reescrita. A escolha de
hospedagem foi tomada antes do brainstorm técnico, por decisão de negócio, com
base em escalabilidade e em histórico de instabilidade com self-hosted em
EasyPanel em projetos anteriores.

## Decisão

A hospedagem será **Vercel**. Esta é uma **decisão fechada**: nenhuma alternativa
de hospedagem deve ser reaberta ou sugerida. Toda a arquitetura é construída
sobre as características e limites da Vercel:

- Funções serverless (runtime **Node.js** como padrão — ver ADR-008).
- Ausência de processos long-running e de estado em memória entre requisições.
- Timeout de função como restrição de projeto (nada pesado dentro do
  request/response).
- Vercel Cron para trabalho baseado em tempo (follow-ups, lembretes,
  reconciliação).

## Consequências

- **Positivas:** deploy simples, escalabilidade horizontal automática, encaixe
  natural com Next.js.
- **Negativas / custos:** força padrões serverless — pooling de conexões
  obrigatório (ADR-002), assíncrono via fila gerenciada (ADR-009), nada de
  worker persistente. Operações pesadas (import massivo, relatórios grandes)
  ficam fora do caminho de request.
- **Impacto em testes:** N/A direto; restrições refletidas nos ADRs 002, 008, 009.

## Alternativas consideradas

- **Self-hosted (EasyPanel/VPS):** rejeitada por histórico de instabilidade e
  custo operacional.
- **Outros PaaS:** fora de escopo — decisão de negócio já tomada.

## Como alterar esta decisão

Decisão de negócio fixa. Só um novo ADR aprovado poderia revê-la.
