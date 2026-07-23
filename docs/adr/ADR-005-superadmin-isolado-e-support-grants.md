# ADR-005: Superadministrador isolado e suporte via support_grants

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** F1
- **Documentos relacionados:** [multitenancy-security](../architecture/multitenancy-security.md) *(Commit 2)*

## Contexto

O superadministrador da plataforma precisa operar o SaaS (provisionar clínicas,
planos, suporte) sem se tornar um "admin onipotente" cujo bug ou credencial
vazada exponha todos os tenants. O acesso a dados de uma clínica precisa ser
justificado, temporário e auditável (LGPD).

## Decisão

1. O superadmin vive em `platform_admins` (**não** é um papel de clínica) e opera
   em um grupo de rotas separado (`/(platform)`), isolado das rotas e permissões
   das clínicas.
2. **Por padrão, o superadmin não enxerga dados de clínica via RLS.** Para tocar
   dados de uma clínica, precisa de um **`support_grant`** válido.
3. **`support_grants`** são escopados a **uma única clínica**, com:
   - **Nível de acesso explícito:** `read_only` (**padrão**), `support_operations`,
     `restricted_write`.
   - **Motivo obrigatório**; justificativa mais detalhada exigida para escrita.
   - **Expiração automática** e possibilidade de **revogação imediata**.
4. Um grant **nunca** pode: alterar proprietário da clínica; excluir a clínica;
   alterar assinatura/plano fora do fluxo próprio; ver/alterar credenciais e
   tokens de integrações; criar outros grants; modificar papéis/permissões do
   proprietário; desativar logs de auditoria. Essas ações checam
   explicitamente `via <> 'support'`.
5. **Toda ação sob grant é auditada** em `audit_logs`: administrador, clínica,
   grant, motivo, nível de acesso, entidade afetada, ação, data/hora, e
   `before`/`after` quando aplicável.
6. A interface deixa **visualmente claro** (banner obrigatório) quando o
   administrador opera dentro de uma clínica via grant.
7. A clínica pode **consultar posteriormente** o histórico de acessos de suporte.

### Escopo do painel do superadmin no MVP

Apenas o mínimo: visualizar clínicas e status; consultar features/limites;
suspender/reativar clínica no fluxo autorizado; criar/revogar `support_grants`;
consultar auditoria e estado técnico; ver métricas agregadas permitidas. O
superadmin **não** cria/edita contatos, pacientes, oportunidades, mensagens,
agendamentos ou orçamentos diretamente — operação em clínica só via grant válido
com banner.

## Consequências

- **Positivas:** acesso mínimo, temporário, justificado e logado; proteção
  contra vazamento de credencial e conformidade LGPD.
- **Negativas / custos:** mais passos para o suporte operar (intencional).
- **Impacto em testes:** superadmin sem grant é negado; grant expirado é negado;
  ações proibidas bloqueadas mesmo com grant.

## Alternativas consideradas

- **Superadmin com `service role` global:** rejeitada — é a chave-mestra do banco
  inteiro, sem escopo nem expiração.

## Como alterar esta decisão

Novo ADR aprovado.
