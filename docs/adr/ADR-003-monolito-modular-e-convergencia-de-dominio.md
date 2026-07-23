# ADR-003: Monólito modular por domínio e convergência de casos de uso

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** transversal (fronteiras); F2/F3 (convergência)
- **Documentos relacionados:** [module-boundaries](../architecture/module-boundaries.md), [overview](../architecture/overview.md) *(Commit 2)*

## Contexto

Para 100–500 tenants, um Postgres bem modelado e uma aplicação Next.js bem
organizada são suficientes. Microserviços resolveriam um problema que não temos
e criariam outros (transações distribuídas, deploy múltiplo, observabilidade
fragmentada). Ao mesmo tempo, "modular" precisa ser uma fronteira real, não uma
pasta bonita — e a mesma regra de negócio (criar lead) chegará por múltiplas
entradas (interface manual, webhook de WhatsApp, futuros formulários).

## Decisão

1. A arquitetura é um **monólito modular organizado por domínio** dentro do
   Next.js. **Não** usaremos microserviços, workers persistentes ou filas
   próprias de infraestrutura por precaução.
2. Cada módulo expõe uma **interface pública** (`index.ts`); nenhum módulo
   alcança os internals de outro. Acesso a banco e fila é feito por interfaces de
   `shared/` (`shared/db`, `shared/queue`), nunca pelo SDK direto no domínio.
3. **Convergência de casos de uso (decisão permanente):** a criação/localização
   de contato e a abertura de oportunidade têm **um único caso de uso de
   domínio** (conceitualmente `createOrFindContactAndOpenOpportunity`). O fluxo
   manual (interface), o processor do webhook e futuros formulários podem ter
   **entradas diferentes**, mas convergem para os **mesmos serviços de domínio**,
   que executam de forma centralizada:
   - Normalização de telefone e e-mail.
   - Busca ou criação do contato (deduplicação).
   - Busca ou criação da oportunidade (pipeline/etapa).
   - Associação do responsável.
   - Criação da `activity`.
   - Registro da atribuição disponível.
   - Idempotência quando existir chave externa.

   É **proibido** haver lógica de criação/deduplicação separada por endpoint.

## Consequências

- **Positivas:** coerência entre entradas; deduplicação e regras de atribuição
  existem em um só lugar; a F3 (WhatsApp) pluga na tubulação já testada na F2.
- **Negativas / custos:** exige disciplina de fronteiras e uma camada de
  adaptação de entrada (normalização) por origem.
- **Impacto em testes:** testes de arquitetura que impedem importações entre
  internals de módulos e uso do SDK de fila/banco fora de `shared/`; testes de
  que manual e webhook produzem o mesmo resultado de domínio.

## Alternativas consideradas

- **Microserviços:** rejeitada — complexidade sem payoff nesta escala.
- **Lógica de criação duplicada por entrada:** rejeitada — fonte garantida de
  divergência e bugs de deduplicação.

## Como alterar esta decisão

Novo ADR aprovado.
