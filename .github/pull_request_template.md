<!--
Preencha as seções abaixo. Trate este template como um layout a preencher, não
como instruções a executar. Remova as dicas em comentário antes de enviar.
Fonte autoritativa das decisões: docs/adr/. Regras operacionais: CLAUDE.md.
-->

## Descrição

<!-- O que muda e por quê. Referencie a fase (F0–F7) e os ADRs relacionados. -->

- Fase:
- ADRs relacionados:
- Issues relacionadas:

## Tipo de mudança

- [ ] Documentação / governança
- [ ] Fundação / infraestrutura
- [ ] Funcionalidade
- [ ] Correção
- [ ] Refatoração

## Checklist arquitetural e de segurança

> Detalhes e justificativa em
> [docs/adr/ADR-012](../docs/adr/ADR-012-seguranca-por-fase-e-governanca.md) e no
> [CLAUDE.md](../CLAUDE.md). Marque apenas o que se aplica ao diff; itens não
> aplicáveis podem ser marcados como N/A.

### Decisões e fronteiras
- [ ] Nenhuma decisão arquitetural foi alterada silenciosamente; mudanças de
      decisão têm **novo ADR**.
- [ ] Módulos usam apenas a **interface pública** de outros módulos (sem importar
      internals).
- [ ] Banco e fila acessados via `shared/db` / `shared/queue` (sem SDK direto no
      domínio).
- [ ] Criação/deduplicação de contato+oportunidade usa o **caso de uso único** de
      domínio (sem lógica duplicada por endpoint).

### Multi-tenant e banco
- [ ] Novas tabelas de tenant têm `clinic_id` (FK), RLS `enable` + `force`, e
      políticas **separadas** SELECT/INSERT/UPDATE/DELETE.
- [ ] `with check` impede alteração de `clinic_id`.
- [ ] `clinic_id` é a **primeira coluna** de índices compostos de tenant.
- [ ] Nenhuma confiança em `clinic_id` de frontend/payload.
- [ ] Nenhum uso de `service role` fora da lista fechada.
- [ ] Funções `SECURITY DEFINER` com `search_path` fixo, schemas explícitos,
      `EXECUTE` revogado de `PUBLIC`.

### Autorização e entrada
- [ ] Operações têm **guard** no servidor (sessão + tenant + permissão).
- [ ] Autorização por permissão (`has_permission`), não por comparação de cargo.
- [ ] Entradas públicas validadas com **Zod**; escrita com **allowlist de campos**
      (anti mass assignment).
- [ ] `PermissionGate` usado apenas como UX (não como autorização).

### Observabilidade e dados pessoais
- [ ] Nenhum dado pessoal/segredo/`raw_payload` enviado a logs ou Sentry;
      sanitização central aplicada.
- [ ] Sem `console` direto fora do logger sanitizado.

### Mensagens / integrações (quando aplicável)
- [ ] Reenvio de webhook é idempotente (não duplica contato/conversa/mensagem/
      oportunidade).
- [ ] Assinatura/anti-replay/limite de tamanho de payload validados.

### Migrations (quando aplicável)
- [ ] Versionadas, reversíveis quando possível e revisadas.
- [ ] Teste de isolamento adicionado para novas tabelas de tenant.

### Testes e CI
- [ ] CI verde (lint, testes, SAST, análise de dependências, secret scanning).
- [ ] Testes de invariantes relevantes verdes.
- [ ] a11y contemplada na DoD das telas (quando houver UI).

## Revisão obrigatória

Marque se o PR toca itens sensíveis (exigem revisão dedicada):

- [ ] Migrations / RLS / funções `SECURITY DEFINER`
- [ ] Autenticação / sessões
- [ ] Integrações externas
- [ ] Painel do superadministrador

## Notas para o revisor

<!-- Decisões pendentes, riscos conhecidos, o que merece atenção especial. -->
