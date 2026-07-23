# Ambientes e configuração

- **Objetivo:** documentar a convenção de ambientes e as regras de configuração
  segura da aplicação (documento operacional da F0).
- **Escopo:** dev/staging/produção, variáveis de ambiente, separação
  server/client, validação e proibições.
- **ADRs relacionados:** [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md),
  [ADR-001](../adr/ADR-001-hospedagem-vercel.md).
- **Documentos relacionados:** [ssdlc](../security/ssdlc.md),
  [deploy-checklist](../security/deploy-checklist.md).
- **Última revisão:** 2026-07-23.

> Documento **operacional**: não substitui nem contradiz os ADRs e documentos
> aprovados. Nenhum serviço real (Supabase, Vercel, QStash, observabilidade)
> está conectado na F0.

## 1. Ambientes

| Ambiente | Uso | Dados |
|---|---|---|
| **development** | máquina local | somente fictícios |
| **staging** | validação pré-produção | somente fictícios até o gate F7 |
| **production** | produção | **somente após aprovação do gate F7** |

O ambiente lógico é definido por `APP_ENV` (`development` \| `staging` \|
`production`) — separado de `NODE_ENV`, que pertence ao build. Cada ambiente
terá seu próprio conjunto de segredos (configurados na plataforma de hospedagem
nas fases seguintes); **segredos nunca são compartilhados entre ambientes**.

## 2. Regras de variáveis

- **Server-side:** lidas apenas via `src/shared/config` (protegido por
  `server-only` — importar no client quebra o build).
- **Client-side:** apenas variáveis com prefixo `NEXT_PUBLIC_`, declaradas no
  schema de client em `src/shared/config/env-schema.ts`. Nunca colocar segredo
  em variável pública.
- **Validação:** Zod, eager (falha na subida). Mensagens de erro citam **apenas
  os nomes** das variáveis — nunca os valores.
- **Arquivos:** `.env*` são ignorados pelo git; só `.env.example` (sem valores
  reais) é versionado. Localmente, use `.env.local`.
- **Novas variáveis:** cada integração adiciona as suas na fase em que é
  implementada, atualizando o schema e o `.env.example`. Não criar chaves
  fictícias antecipadamente.

## 3. Proibições

- Nenhum segredo commitado no repositório (Gitleaks roda no CI).
- Nenhum segredo em código client ou em variável `NEXT_PUBLIC_*`.
- Nenhum valor de variável em logs ou mensagens de erro.
- Nenhuma conexão a serviço real antes da fase correspondente (e nenhum dado
  real antes do gate F7 — [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md)).
