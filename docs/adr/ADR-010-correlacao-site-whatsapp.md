# ADR-010: Correlação site→WhatsApp por token, com nível de confiança

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** F3 (captura) / F5 (relatórios)
- **Documentos relacionados:** [messaging-attribution](../architecture/messaging-attribution.md) *(Commit 2)*

## Contexto

Não é possível ligar navegador e número de WhatsApp sem um identificador de
correlação. No fluxo Click-to-WhatsApp (CTWA) a Meta fornece `ctwa_clid` na
primeira mensagem (determinístico). Na jornada anúncio → site/landing → WhatsApp,
o clique ocorre no navegador e a mensagem chega por outro canal — precisamos criar
o identificador.

## Decisão

1. **CTWA:** ler e preservar todo o objeto `referral` (incl. `ctwa_clid`) da
   primeira mensagem — atribuição determinística, **alta confiança**.
2. **Site→WhatsApp:** mecanismo primário é um **token no texto pré-preenchido**
   do `wa.me`, apresentado de forma **natural** ao lead (ex.: "Olá, gostaria de
   saber mais sobre os procedimentos. Ref.: ABC123"). O sistema deve:
   - Gerar um token **curto e não sequencial**.
   - **Não** colocar dados pessoais ou da campanha dentro do token.
   - Associar o token ao `tracking_click` **no servidor**.
   - Definir **prazo de validade** para a correlação e **impedir reutilização
     indevida** (uso único).
   - **Remover/ocultar** o código da visualização principal da conversa quando
     possível, **sem alterar** a mensagem original armazenada (preservada para
     auditoria).
   - Marcar atribuição como **alta confiança** quando o token válido for recebido.
3. **Fallback temporal** (clique recente sem token) é usado **somente** como
   fallback e marcado como **confiança baixa ou média**.
4. **Uma atribuição probabilística nunca é apresentada como certeza.** O nível de
   confiança é sempre visível.

## Consequências

- **Positivas:** correlação honesta e auditável; alta confiança quando há token.
- **Negativas / custos:** token pode ser editado/apagado pelo lead → cai para
  fallback de menor confiança (comportamento esperado e sinalizado).
- **Impacto em testes:** token válido → alta confiança; token expirado/reutilizado
  → rejeitado; fallback temporal → confiança baixa/média.

## Alternativas consideradas

- **Correlação puramente temporal/heurística como principal:** rejeitada — ambígua
  com volume; risco de atribuição errada apresentada como certa.
- **Fingerprint de navegador:** rejeitada — frágil, invasivo e sem ligação
  confiável com o número de WhatsApp.

## Como alterar esta decisão

Novo ADR aprovado.
