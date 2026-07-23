# Revisão de Pull Requests — checklist arquitetural e de segurança

Este documento descreve o processo de revisão de PRs e onde vive o checklist
arquitetural e de segurança. Para evitar fontes divergentes, o checklist
**operacional** (com os itens marcáveis) fica em um único lugar:
[`.github/pull_request_template.md`](../../.github/pull_request_template.md).
A **justificativa** de cada regra está no
[ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md) e no
[`CLAUDE.md`](../../CLAUDE.md).

## Onde está o checklist

- **Checklist marcável (canônico):** `.github/pull_request_template.md` — abre
  automaticamente em cada PR.
- **Regras e justificativa:** `ADR-012` (governança, invariantes, segurança por
  fase) e `CLAUDE.md` (invariantes operacionais).

## Regras de governança (resumo — ver ADR-012)

- Pull request obrigatório para alterações importantes; **CI obrigatório antes de
  merge**; branch principal **protegida**.
- Secret scanning ativo; Dependabot (ou equivalente) para alertas de dependências.
- **Revisão obrigatória** quando o PR toca: migrations, RLS, funções
  `SECURITY DEFINER`, autenticação, integrações externas, ou o painel do
  superadministrador.
- CODEOWNERS (ou equivalente) quando houver mais pessoas no projeto.
- Proibição de commits diretamente em produção.
- Migrations sempre versionadas, reversíveis quando possível e revisadas antes do
  deploy.

## Fluxo de revisão

1. Autor abre o PR e preenche o template (descrição, fase, ADRs, checklist).
2. CI roda (lint, testes, SAST, análise de dependências, secret scanning e, a
   partir da F0, os testes de invariantes).
3. Revisor verifica: aderência aos ADRs, checklist honesto, e revisão dedicada
   dos itens sensíveis marcados.
4. Merge apenas com CI verde e checklist satisfeito.

## O que NÃO fazer nesta fase

O projeto está em **documentação e governança** (pré-implementação). Não há CI
configurado, proteção de branch, nem ferramentas ativas ainda — estes controles
serão **implementados na F0** (ver ADR-012). Este documento e o template definem
o alvo; a automação vem depois.
