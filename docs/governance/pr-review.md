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

## Definição de "pronto" para PRs de interface

[`docs/design/kit.html`](../design/kit.html) é a base dos mockups de tela: um
arquivo autocontido que **copia** os tokens de `src/app/globals.css` e replica
visualmente os componentes de `src/shared/ui/`. Por ser cópia, ele desatualiza em
silêncio — o app muda, o kit continua mostrando a interface antiga, e o design
passa a desenhar telas que o código não consegue reproduzir.

Por isso, um PR que altere **`src/app/globals.css` ou `src/shared/ui/`** só está
pronto quando `docs/design/kit.html` acompanha a mudança. Isso não é etapa
opcional nem trabalho de acompanhamento: entra no mesmo PR.

O que atualizar em cada caso:

- **Mudou token em `:root` ou `.dark` de `globals.css`** — copie os blocos
  literalmente para a seção "1. TOKENS" do kit. Verificado automaticamente por
  [`tests/architecture/design-kit-tokens.test.ts`](../../tests/architecture/design-kit-tokens.test.ts);
  o teste falha no CI e diz o que fazer. Token novo costuma pedir mais que a
  linha copiada — se ele existe para um estado que o kit ainda não mostra,
  acrescente a amostra.
- **Mudou um componente de `shared/ui/`** — atualize a réplica correspondente no
  kit, incluindo variantes, tamanhos e estados. As classes `.k-*` do kit são a
  tradução manual das classes Tailwind do componente. **Não há teste cobrindo
  isto**: é conferência do revisor, e a seção de cada componente no kit declara
  o arquivo de origem justamente para permitir essa conferência.
- **Componente novo em `shared/ui/`** — acrescente a seção dele ao kit. Sem
  isso, o componente não existe para quem faz mockup e acaba redesenhado à mão.
- **Componente removido ou promovido para outro lugar** — remova ou mova a seção
  e atualize o "Registro de divergências e lacunas" no fim do kit.

Quando a atualização fiel não couber no PR, o caminho é registrar a lacuna no
"Registro de divergências e lacunas" do próprio kit — nunca deixar a divergência
implícita. Aproximar valor "de olho" é pior que registrar a pendência: o kit vale
como referência exatamente porque nada nele foi inventado.

## O que NÃO fazer nesta fase

O projeto está em **documentação e governança** (pré-implementação). Não há CI
configurado, proteção de branch, nem ferramentas ativas ainda — estes controles
serão **implementados na F0** (ver ADR-012). Este documento e o template definem
o alvo; a automação vem depois.
