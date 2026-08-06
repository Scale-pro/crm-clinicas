# Ambientes e configuração

- **Objetivo:** documentar a convenção de ambientes e as regras de configuração
  segura da aplicação (documento operacional da F0).
- **Escopo:** dev/staging/produção, variáveis de ambiente, separação
  server/client, validação e proibições.
- **ADRs relacionados:** [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md),
  [ADR-001](../adr/ADR-001-hospedagem-vercel.md).
- **Documentos relacionados:** [ssdlc](../security/ssdlc.md),
  [deploy-checklist](../security/deploy-checklist.md),
  [primeiro-ambiente](../runbooks/primeiro-ambiente.md).
- **Última revisão:** 2026-08-06.

> Documento **operacional**: não substitui nem contradiz os ADRs e documentos
> aprovados.

## 0. Estado atual e estado alvo

**Hoje nenhum serviço real está conectado.** Não existe projeto Supabase
hospedado, nem deploy, nem fila, nem provedor de observabilidade. A aplicação só
roda contra a stack local do Supabase (`pnpm supabase start`), e é assim que o
CI a valida.

O **estado alvo do primeiro ambiente** (`staging`) é:

| Peça | Estado alvo | O que falta |
|---|---|---|
| Banco + Auth | projeto Supabase hospedado, migrations aplicadas por `db push` | criar o projeto e rodar o push |
| Hospedagem | projeto Vercel com as cinco variáveis da seção 3 | criar o projeto e cadastrar as variáveis |
| MFA | TOTP habilitado no painel do Supabase | habilitar — sem isso a configuração da operação fica inacessível (ver seção 4) |
| Configuração de Auth | Site URL e Redirect URLs apontando para `APP_URL` | configurar no painel; hoje não é versionado (ver seção 5) |
| Fila | — | nada a fazer: não há fila nem variável até a F3 |
| Observabilidade | — | provedor ainda não decidido ([ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md)) |
| Dados | somente fictícios | vale até o gate F7 |

O passo a passo executável está em
[runbooks/primeiro-ambiente](../runbooks/primeiro-ambiente.md), que também lista
os **bloqueios conhecidos** para rodar hospedado.

## 1. Ambientes

| Ambiente | Uso | Dados |
|---|---|---|
| **development** | máquina local | somente fictícios |
| **test** | testes HTTP locais/CI | somente fictícios |
| **staging** | validação pré-produção | somente fictícios até o gate F7 |
| **production** | produção | **somente após aprovação do gate F7** |

O ambiente lógico é definido por `APP_ENV` (`development` \| `test` \|
`staging` \| `production`) — separado de `NODE_ENV`, que pertence ao build. Cada ambiente
terá seu próprio conjunto de segredos (configurados na plataforma de hospedagem
nas fases seguintes); **segredos nunca são compartilhados entre ambientes**.

`APP_URL` define a origem canônica da aplicação e é usada para callbacks fixos
de autenticação. Ela é server-only; redirects fornecidos pelo usuário nunca
substituem essa origem.

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

## 3. Inventário de variáveis

Levantado do código: estas são **todas** as variáveis que a aplicação lê. A
fonte é `src/shared/config/env-schema.ts`; qualquer outra chave presente no
ambiente é ignorada.

### Obrigatórias

Sem qualquer uma delas a aplicação **não sobe**. A validação é *eager*:
`src/shared/config/index.ts` chama `parseEnv` no import do módulo, e o erro cita
apenas os **nomes** das variáveis, nunca os valores.

> Consequência prática no provisionamento: como `next build` importa os módulos
> de rota para coletar dados de página, **o próprio build falha** se as
> variáveis não estiverem presentes. Isso torna `APP_URL` um problema de ovo e
> galinha na Vercel — ver o bloqueio correspondente em
> [primeiro-ambiente](../runbooks/primeiro-ambiente.md#bloqueios-conhecidos).

| Variável | Formato | Onde é usada | Onde obter |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL | cliente de servidor, de navegador e o proxy de sessão | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | texto não vazio | idem | Supabase → Project Settings → API (publishable/`anon`) |
| `APP_URL` | URL | origem canônica dos callbacks de e-mail e do link de convite | a URL pública do deploy |
| `ACTIVE_CLINIC_COOKIE_SECRET` | texto, **mínimo 32 caracteres** | assina o cookie de clínica ativa (`modules/tenancy/active-clinic.ts`) | gerar aleatoriamente, um por ambiente |

As duas primeiras são `NEXT_PUBLIC_*` e **entram no bundle do navegador** por
construção — é o par público do Supabase, protegido por RLS, não um segredo. As
duas últimas são server-only.

### Opcionais

| Variável | Padrão | O que acontece se faltar |
|---|---|---|
| `APP_ENV` | `development` | a aplicação sobe normalmente e se comporta como ambiente de desenvolvimento. O risco é silencioso: um deploy hospedado sem `APP_ENV` se declara `development` em qualquer lugar que consulte o ambiente lógico. **Defina explicitamente** em staging e produção. |
| `NODE_ENV` | definido pelo runtime | não é configurada à mão. Só o logger a consulta, para decidir o formato da saída (`src/shared/observability/logger.ts`). A Vercel define em produção. |

### Não existem (e não devem ser inventadas)

| Assunto | Situação |
|---|---|
| Fila (QStash/Upstash) | `src/shared/queue` expõe só o contrato e um publicador no-op. Nenhuma variável até a F3. |
| Observabilidade (Sentry etc.) | Provedor não decidido. Nenhuma variável. |
| WhatsApp / Meta / Evolution | Chegam na F3, com seus adapters. |
| `service_role` / secret key do Supabase | **A aplicação nunca a lê.** Não cadastre na hospedagem. Fluxos de usuário usam a sessão/JWT ([ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md)). |
| `API_URL`, `SERVICE_ROLE_KEY`, `DB_URL`, `PUBLIC_KEY_KIND` | Existem **apenas** para a suíte de integração e para o CI, contra a stack local. Não são variáveis da aplicação e não vão para a hospedagem. |

## 4. Configuração que não é variável de ambiente

Nem tudo que o ambiente real precisa cabe em variável. Estes ajustes vivem no
painel do Supabase e **afetam o funcionamento da aplicação**:

- **MFA TOTP habilitado.** Boa parte das RPCs de escrita chama
  `app_private.require_aal2()`, que recusa sessão que não seja `aal2`. Com TOTP
  desabilitado no projeto o usuário não consegue registrar fator, e **toda a
  configuração da operação fica inacessível**: profissionais, procedimentos,
  pipelines, convites e ajustes da clínica. Contatos, oportunidades e a criação
  da primeira clínica **não** exigem AAL2 — o corte exato está em
  [primeiro-ambiente](../runbooks/primeiro-ambiente.md#4-configurar-o-auth-do-projeto).
- **Site URL e Redirect URLs.** A recuperação de senha aponta explicitamente
  para `<APP_URL>/auth/callback`; o cadastro depende do Site URL (ver os
  bloqueios em [primeiro-ambiente](../runbooks/primeiro-ambiente.md)).
- **Confirmação de e-mail.** `create_clinic_with_owner` exige
  `email_confirmed_at` preenchido: sem confirmar, o onboarding recusa.
- **Política de senha.** O local usa mínimo de 6 caracteres. A aplicação não
  impõe tamanho próprio — quem define é o projeto Supabase.

## 5. Lacuna conhecida: configuração de Auth não é versionada

`supabase/config.toml` descreve **somente** a stack local. A configuração
equivalente do projeto hospedado (Site URL, redirects, MFA, política de senha)
existe só no painel: não passa por PR, não tem histórico e não é comparável
entre ambientes. Enquanto isso não mudar, tratar a seção 4 como checklist
manual de provisionamento e de auditoria.

## 6. Proibições

- Nenhum segredo commitado no repositório (Gitleaks roda no CI).
- Nenhum segredo em código client ou em variável `NEXT_PUBLIC_*`.
- Nenhum valor de variável em logs ou mensagens de erro.
- Nenhuma conexão a serviço real antes da fase correspondente (e nenhum dado
  real antes do gate F7 — [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md)).
