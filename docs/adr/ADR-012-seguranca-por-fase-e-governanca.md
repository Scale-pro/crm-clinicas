# ADR-012: Segurança distribuída por fase, invariantes verificáveis e governança

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** F0–F7 (transversal)
- **Documentos relacionados:** [ssdlc](../security/ssdlc.md), [deploy-checklist](../security/deploy-checklist.md), [pentest-scope](../security/pentest-scope.md) *(Commit 3)*

## Contexto

Segurança implementada só no fim vira dívida impagável. A cibersegurança/SSDLC é
critério **bloqueante** de lançamento, mas os controles precisam nascer junto de
cada fase. As invariantes não podem existir apenas como texto — precisam ser
verificáveis automaticamente. E o repositório precisa de governança (PRs,
proteção de branch, revisão obrigatória de itens sensíveis).

## Decisão

### Segurança distribuída por fase (F7 comprova, não inicia)

- **F0:** secret scanning; SAST; análise de dependências; separação de ambientes;
  configuração segura de variáveis; política de atualização de dependências;
  logs e captura de erros com sanitização.
- **F1:** RLS; MFA para papéis administrativos; rate limiting de autenticação;
  proteção de recuperação de senha e convites; gestão segura de sessões; backups
  e PITR; logs de auditoria; `SECURITY DEFINER` endurecido; suporte auditável.
- **F2:** validação de entradas; allowlist de campos; proteção contra mass
  assignment; testes de autorização em Server Actions e Route Handlers.
- **F3:** validação de assinatura dos webhooks; anti-replay; idempotência; rate
  limiting; proteção dos segredos de cada conexão; segurança do QStash; DLQ;
  alertas; reconciliação; limites de tamanho de payload.
- **F4/F5:** segurança de dados pessoais; consentimento e base legal; proteção
  das integrações; retenção e exclusão dos dados; segurança de arquivos, se
  persistidos.
- **F7 (gate):** pentest; teste de restauração; revisão das políticas RLS;
  revisão de secrets; revisão da configuração de produção; correção dos achados;
  execução do checklist final; **aprovação formal para dados reais**.

**WAF / proteção de borda é obrigatório para lançamento** (config mínima,
documentada e testada) para: login, recuperação de senha, convites, webhooks,
links públicos de rastreamento, endpoints de integração e painel do
superadministrador.

### Invariantes verificáveis automaticamente (planejadas para a F0)

Estas verificações são **documentadas agora e incluídas no plano da F0**
(não implementadas neste momento). Poderão usar ESLint, testes de arquitetura,
scripts de CI e consultas ao catálogo do PostgreSQL:

1. Impedir importações diretas entre internals de módulos diferentes.
2. Garantir uso apenas da interface pública de outro módulo.
3. Detectar acesso direto ao SDK da fila fora de `shared/queue`.
4. Detectar acesso direto inadequado ao banco fora das camadas autorizadas.
5. Detectar uso de `service role` fora da lista permitida.
6. Detectar `console` direto fora do logger sanitizado.
7. Impedir envio de `raw_payload`, telefone, e-mail, tokens e headers de
   autenticação para logs.
8. Exigir validação Zod em entradas públicas.
9. Exigir teste de isolamento para novas tabelas de tenant.
10. Detectar migrations que criem tabela de tenant sem `clinic_id` ou sem RLS.
11. Verificar que nenhuma função `SECURITY DEFINER` mantenha `EXECUTE` para
    `PUBLIC`.

### Governança de repositório

- Pull request obrigatório para alterações importantes; CI obrigatório antes de
  merge; branch principal protegida.
- Secret scanning ativo; Dependabot (ou equivalente) para alertas de dependências.
- **Revisão obrigatória** para migrations, RLS, funções `SECURITY DEFINER`,
  autenticação, integrações e alterações no superadmin.
- CODEOWNERS (ou equivalente) quando houver mais pessoas.
- Proibição de commits diretamente em produção.
- Migrations sempre versionadas, reversíveis quando possível e revisadas antes do
  deploy.

### Critério final de lançamento

O produto pode ser funcional e demonstrável antes da F7, mas **nenhuma clínica
real opera com dados reais até a aprovação do gate de segurança (F7)**. Ambientes
anteriores usam apenas dados fictícios, números de WhatsApp de teste, contas de
anúncios de teste (quando possível), clínicas fictícias e usuários internos
autorizados.

## Consequências

- **Positivas:** segurança como propriedade contínua; invariantes que não
  dependem de vigilância humana; rastreabilidade de decisões sensíveis.
- **Negativas / custos:** mais fricção de processo (intencional).
- **Impacto em testes:** as 11 verificações acima passam a fazer parte do CI a
  partir da F0.

## Alternativas consideradas

- **Segurança concentrada na F7:** rejeitada — vira dívida impagável.
- **Invariantes só como texto:** rejeitada — não são cumpridas sem automação.

## Como alterar esta decisão

Novo ADR aprovado.
