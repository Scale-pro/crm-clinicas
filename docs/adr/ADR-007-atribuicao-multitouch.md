# ADR-007: Atribuição de origem multi-touch por oportunidade

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** F3 (captura) / F5 (ampliação e relatórios)
- **Documentos relacionados:** [messaging-attribution](../architecture/messaging-attribution.md) *(Commit 2)*

## Contexto

Um único campo `source` em `contacts` é insuficiente: um contato pode ter várias
oportunidades e entrar por campanhas diferentes ao longo do tempo. Precisamos
rastrear origem por oportunidade e por toque (touchpoint), com honestidade sobre
o nível de confiança da atribuição.

## Decisão

Modelo de atribuição em camadas, **por oportunidade e touchpoint** (não apenas em
`contacts`):

1. **Captura (F3):** desde a primeira mensagem, o sistema captura e preserva
   `referral` do Click-to-WhatsApp, `ctwa_clid`, IDs de anúncio disponíveis,
   UTMs, token de correlação, `tracking_click_id` e o `payload` original,
   criando um `attribution_touchpoint` inicial.
2. **Entidades:** `tracking_links`, `tracking_clicks` (clique = sessão),
   `attribution_touchpoints` (elo central com `first_touch`/`last_touch` e
   `confidence`), `ad_accounts`/`ad_campaigns`/`ad_sets`/`ads` (metadados Meta),
   `conversion_events` (saída para a Meta).
3. Cada `attribution_touchpoint` relaciona: `clinic_id`, `contact_id`,
   `opportunity_id`, `conversation_id`, mensagem inicial, `tracking_click_id`,
   canal, plataforma, campanha/conjunto/anúncio, `ctwa_clid`, `fbclid`, UTMs,
   `first/last`, data/hora, payload original e **nível de confiança**.
4. O CRM mostra **primeira origem, última origem e nível de confiança**.
5. Quando um contato antigo retorna por nova campanha e abre nova oportunidade,
   essa nova oportunidade **pode ter atribuição diferente**.
6. **F5 amplia** (experiência, sincronização, visualização, relatórios) sobre
   dados que **já começaram a ser coletados na F3** — F5 não inicia a captura.
7. A integração posterior com Meta Ads **enriquece** os IDs existentes (nomes,
   status, custo) **sem substituir nem perder** os dados originais capturados.

## Consequências

- **Positivas:** relatórios por campanha/conjunto/anúncio, 1ª/última origem,
  e (com custo da Meta) CPL/CPA/ROAS; atribuição nunca apresentada como certeza.
- **Negativas / custos:** mais tabelas e joins; correlação site→WhatsApp depende
  de identificador (ADR-010).
- **Impacto em testes:** teste de que origem é gravada por oportunidade/touchpoint;
  teste de preservação do `referral` do CTWA.

## Alternativas consideradas

- **Campo `source` em `contacts`:** rejeitada — perde histórico multi-campanha e
  multi-oportunidade.

## Como alterar esta decisão

Novo ADR aprovado.
