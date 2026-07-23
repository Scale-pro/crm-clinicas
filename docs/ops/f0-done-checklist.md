# Definition of Done — Fase F0 (fundação técnica)

- **Objetivo:** registrar, com evidências reais de execução, a conclusão da F0.
- **Escopo:** checklist da DoD aprovada no plano da F0 (documento operacional).
- **ADRs relacionados:** [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md),
  [ADR-003](../adr/ADR-003-monolito-modular-e-convergencia-de-dominio.md).
- **Documentos relacionados:** [environments](environments.md),
  [deploy-checklist](../security/deploy-checklist.md).
- **Última revisão:** 2026-07-23.

> Evidências coletadas na execução local de 2026-07-23 (Node v22.22.2,
> pnpm 10.33.0) e nos commits da branch `claude/claude-code-plugin-setup-kysnwn`.
> Itens dependentes do GitHub (execução dos workflows, recursos de plano)
> estão marcados e listados em §3.

## 1. Checklist com evidências

| Item | Resultado | Evidência |
|---|---|---|
| Build verde | ✅ | `pnpm build` — rotas `/` e `/_not-found` geradas, sem erros |
| Typecheck verde | ✅ | `pnpm typecheck` (tsc --noEmit, strict + noUncheckedIndexedAccess) sem erros |
| Lint verde | ✅ | `pnpm lint` (ESLint 9 + eslint-config-next + regras de fronteira) sem erros |
| Testes verdes | ✅ | `pnpm test` — 3 arquivos, **24 testes aprovados** (6 arquitetura, 4 env, 14 observabilidade) |
| CI criado e válido | ✅ (criado) | `.github/workflows/ci.yml` e `codeql.yml` (YAML validado); execução real ocorre no GitHub — §3 |
| SAST configurado | ✅ (workflow) | CodeQL javascript-typescript em push/PR/agenda semanal |
| Secret scanning | ✅ (parcial) | Gitleaks no CI (container oficial, histórico completo); scanning nativo do GitHub — §3 |
| Dependabot configurado | ✅ | `.github/dependabot.yml` (npm + github-actions, semanal) |
| Auditoria de dependências | ✅ | `pnpm audit --audit-level high` → **No known vulnerabilities found** (após overrides postcss≥8.5.12, sharp≥0.35.0) |
| Estrutura modular criada | ✅ | `src/modules/README.md` (módulos por fase) + `src/shared/{db,queue,auth,config,lib,observability,ui}` |
| Fronteiras verificáveis | ✅ | dependency-cruiser (7 regras) + ESLint `no-restricted-imports`/`no-console`; **provas negativas**: fixtures temporárias geraram 3 erros ESLint + 1 violação depcruise + falha de build server-only, e testes de arquitetura permanentes cobrem os casos |
| Ciclos proibidos | ✅ | regra `no-circular` no depcruise — "no dependency violations found" |
| Client/server boundaries | ✅ | `server-only` em shared/db, shared/queue, shared/auth, shared/config; build **falhou** com client importando shared/db (prova executada e revertida) |
| Logger sanitizado testado | ✅ | 14 testes: allowlist preservada; PII/secrets/raw_payload redigidos; aninhados/Error/causa/headers; circular não derruba; original imutável; produção sem stack; evento truncado |
| Ambientes documentados | ✅ | `docs/ops/environments.md`; validação Zod eager; erros só com nomes de variáveis (testado) |
| Nenhum segredo no repositório | ✅ | `.env*` ignorados (verificado); varredura manual de padrões sem ocorrências; Gitleaks no CI |
| Nenhuma feature de domínio | ✅ | sem tabelas/migrations/RLS/auth funcional/contatos/oportunidades/Kanban/agenda/WhatsApp/tracking/relatórios/superadmin/support grants; grep de domínio: apenas comentários de contrato e a classe CSS `tracking-tight` |
| Nenhuma integração real | ✅ | shared/db, shared/queue e shared/auth respondem `not_configured`; nenhum SDK Supabase/QStash instalado; nenhum serviço configurado |
| Nenhum dado real | ✅ | ambiente somente com placeholders/fixtures de teste |
| Documentação aprovada preservada | ✅ | nenhum arquivo de `docs/` aprovado alterado; únicos novos: `docs/ops/environments.md` e este checklist (autorizados) |
| Working tree limpo / commits enviados | ✅ | verificado após cada push (F0.1–F0.7) |

## 2. Commits da F0

| Unidade | Commit |
|---|---|
| F0.1 bootstrap | `2e239b3` |
| F0.2 design system | `ba4a542` |
| F0.3 fronteiras | `01ee936` |
| F0.4 CI segurança | `e2d0ec7` |
| F0.5 ambientes | `994956c` |
| F0.6 observabilidade | `c02f748` |
| F0.7 validação final | *(este commit)* |

## 3. Ativações manuais pendentes no GitHub (não presumidas como ativas)

Itens que dependem de plano/configuração administrativa do repositório
`Scale-pro/crm-clinicas` e **não** puderam ser verificados/ativados nesta sessão:

1. **Proteção da branch principal** (PR obrigatório, CI obrigatório, proibição de
   push direto) — Settings → Branches.
2. **Secret scanning nativo do GitHub** (e push protection) — Settings →
   Security; disponibilidade depende do plano para repositórios privados.
3. **Code scanning/CodeQL** — o workflow existe, mas em repositório privado de
   organização pode exigir GitHub Advanced Security no plano.
4. **Dependabot alerts** — habilitar em Settings → Security (o arquivo
   `dependabot.yml` cobre *updates*; *alerts* são configuração do repositório).
5. **Execução verde dos workflows** — confirmar a primeira execução real de
   `CI` e `CodeQL` no GitHub Actions.
6. **SHA-pinning das actions** — hoje pinadas por major tag (v4) e mantidas
   pelo Dependabot; fixar por SHA completo é hardening recomendado (não foi
   possível resolver SHAs nesta sessão por restrição de rede).
7. **CODEOWNERS** — criar quando houver mais pessoas no projeto (ADR-012).

## 4. Pronto para a F1

Com a F0 concluída, a F1 (multi-tenant, autenticação e segurança de acesso)
pode ser planejada sobre: estrutura modular com fronteiras verificadas,
interfaces neutras de banco/auth prontas para receber a implementação
Supabase/RLS, logger sanitizado, validação de ambientes e CI de segurança.
