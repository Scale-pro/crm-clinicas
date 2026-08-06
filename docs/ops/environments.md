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

> **Lição registrada (2026-08-06):** este documento afirmava, até esta revisão,
> que "hoje nenhum serviço real está conectado" — com base em não haver nenhum
> `supabase/.temp/project-ref`, nenhuma variável de hospedagem versionada e
> nenhuma menção em PR. Um projeto Supabase hospedado **já existia**, criado e
> configurado direto pelo painel. **Ausência de configuração no repositório não
> prova ausência de ambiente** — Supabase e Vercel se conectam por painel, não
> por arquivo. Nenhum grep, nenhuma migration lida e nenhum ADR revelam isso;
> só perguntar, ou consultar o próprio painel, prova.

**Existe um projeto Supabase hospedado**, com dados de teste (descartáveis, sem
paciente real): clínicas, membros, contato e usuários de `auth` fictícios. Ele
foi provisionado fora deste repositório — não há deploy Vercel confirmado, nem
fila, nem provedor de observabilidade.

Consequência prática já observada: as migrations foram aplicadas **fora da
ordem de nome de arquivo** — um PR mesclado depois (`20260805`, agendamentos)
foi aplicado nesse projeto antes de um PR mesclado antes dele (`20260730`,
WhatsApp), porque a aplicação seguiu a ordem de disponibilidade dos PRs no
painel de quem operou, não a ordem de arquivo. O procedimento de diagnóstico e
os dois caminhos de correção (resetar do zero, ou aplicar o que falta por
cima) estão em
[runbooks/primeiro-ambiente §Banco existente](../runbooks/primeiro-ambiente.md#banco-existente-diagnóstico-e-caminhos).

O **estado alvo** (`staging`) é:

| Peça | Estado alvo | O que falta |
|---|---|---|
| Banco + Auth | projeto Supabase hospedado, migrations aplicadas por `db push`, em ordem de arquivo | reconciliar a ordem — ver runbook |
| Hospedagem | projeto Vercel com as cinco variáveis da seção 3 | confirmar se existe; não verificado a partir do repositório |
| MFA | TOTP habilitado no painel do Supabase | confirmar no painel (ver seção 4) |
| Configuração de Auth | Site URL e Redirect URLs apontando para `APP_URL` | confirmar no painel; não é versionado (ver seção 5) |
| Fila | — | nada a fazer: não há fila nem variável até a F3 |
| Observabilidade | — | provedor ainda não decidido ([ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md)) |
| Dados | somente fictícios | confirmado — nada real observado |

O passo a passo executável está em
[runbooks/primeiro-ambiente](../runbooks/primeiro-ambiente.md), que também lista
os **bloqueios conhecidos** para rodar hospedado e o procedimento de
diagnóstico para descobrir em que estado um banco hospedado está antes de
mexer nele.

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
  `server-only` — importar no client quebra o build). A validação é
  **preguiçosa e memoizada**: roda na primeira leitura de uma variável, não no
  import do módulo. Assim `next build` compila sem os segredos de execução
  (secreto é insumo de execução, não de compilação) e nenhuma requisição é
  atendida com configuração inválida — a primeira leitura em um processo mal
  configurado falha alto, citando só os nomes das variáveis.
- **Client-side:** apenas variáveis com prefixo `NEXT_PUBLIC_`, declaradas no
  schema de client em `src/shared/config/env-schema.ts`. Nunca colocar segredo
  em variável pública.
- **Validação:** Zod, **preguiçosa e memoizada** — roda na primeira leitura de
  uma variável em tempo de execução, não no import do módulo. `next build`
  importa os módulos de rota para coletar dados de página; validar no import
  faria o build exigir segredo, que é insumo de execução, não de compilação.
  Nenhuma requisição é atendida com configuração inválida: a primeira leitura
  em um processo mal configurado falha alto, citando **apenas os nomes** das
  variáveis — nunca os valores. *(Antes do PR #21 a validação era eager e o
  build chegou a exigir os segredos; ver a nota histórica na seção 3.)*
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

Sem qualquer uma delas a aplicação **não atende requisição nenhuma**. A
validação (`src/shared/config/index.ts`) é preguiçosa e memoizada: o **build
não exige** as cinco variáveis, só a primeira requisição em produção exige — e
falha alto, citando apenas os nomes.

> **Nota histórica:** até o PR #21 (*"fix(config): não exija segredos de
> execução para compilar"*), a validação era *eager* e rodava no import do
> módulo — como `next build` importa os módulos de rota, o build inteiro
> exigia as cinco variáveis, inclusive `APP_URL`, que só se conhece depois do
> primeiro deploy sem domínio próprio. Esse era um bloqueio real de
> provisionamento, hoje resolvido.

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

### Opcionais — WhatsApp (F2/WhatsApp)

Todas são opcionais **de propósito**: sem elas a aplicação sobe e opera com o
WhatsApp desligado. Cada uma é exigida no ponto onde é de fato necessária, com
erro alto citando o nome da variável — nunca o valor.

| Variável | Formato | Onde é usada | Se faltar |
|---|---|---|---|
| `SUPABASE_SECRET_KEY` | texto não vazio | executor técnico do webhook e do worker (`src/shared/db/technical.ts`) | as rotas técnicas respondem erro; nenhum fluxo de usuário é afetado |
| `UAZAPI_WEBHOOK_SECRET` | texto, **mínimo 32 caracteres** | autentica a origem do webhook (`/api/whatsapp/uazapi/webhook`) | **todo webhook recebe 401** — é o comportamento correto: sem segredo configurado não há origem confiável |
| `UAZAPI_API_BASE_URL` | URL | destino do envio de mensagens | a mensagem é gravada e a tentativa fecha como `provider_not_configured` |
| `WHATSAPP_CREDENTIAL_KEY` | **32 bytes em base64** | cifra/decifra o token da instância (AES-256-GCM) | não é possível cadastrar nem usar credencial de provedor |
| `QSTASH_TOKEN` | texto não vazio | publica os jobs (`src/shared/queue/qstash.ts`) | a fila cai no publicador no-op: eventos ficam persistidos e `pending`, sem processamento |
| `QSTASH_CURRENT_SIGNING_KEY` | texto não vazio | verifica a assinatura no worker | **todo job recebe 401** |
| `QSTASH_NEXT_SIGNING_KEY` | texto não vazio | idem, durante rotação de chave | a rotação derruba a fila até a chave nova virar a atual |

Gerar `WHATSAPP_CREDENTIAL_KEY`: `openssl rand -base64 32`. É um segredo por
ambiente — girar a chave torna ilegíveis os tokens já gravados, que precisam ser
recadastrados na tela de Ajustes → WhatsApp.

O endereço a cadastrar no painel do provedor é `<APP_URL>/api/whatsapp/uazapi/webhook`,
exibido na própria tela de configuração. O segredo **não** aparece na interface:
mande-o pelo header `x-webhook-secret` ou pelo parâmetro `?t=`.

### Não existem (e não devem ser inventadas)

| Assunto | Situação |
|---|---|
| Observabilidade (Sentry etc.) | Provedor não decidido. Nenhuma variável. |
| Meta / Evolution | Outros provedores de WhatsApp chegam com seus próprios adapters; nenhuma variável hoje. |
| `service_role` key do Supabase | A chave técnica é `SUPABASE_SECRET_KEY` e tem **uso restrito à lista fechada** do [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md) (decisão 3): hoje, só as rotas de webhook e do worker, que chegam sem sessão de usuário. Fluxos de usuário continuam usando a sessão/JWT. |
| `API_URL`, `SERVICE_ROLE_KEY`, `DB_URL`, `PUBLIC_KEY_KIND` | Existem **apenas** para a suíte de integração e para o CI, contra a stack local. Não são variáveis da aplicação e não vão para a hospedagem. |

## 4. Configuração que não é variável de ambiente

Nem tudo que o ambiente real precisa cabe em variável. Estes ajustes vivem no
painel do Supabase e **afetam o funcionamento da aplicação**:

- **MFA TOTP habilitado.** Boa parte das RPCs de escrita chama
  `app_private.require_aal2()`, que recusa sessão que não seja `aal2`. Com TOTP
  desabilitado no projeto o usuário não consegue registrar fator, e **toda a
  configuração da operação fica inacessível**: profissionais, procedimentos,
  pipelines, convites e ajustes da clínica — e, a partir do PR #21 (agenda),
  também as ações rápidas da recepção (Chegou, Iniciar, Receber), que são
  mudanças de status de agendamento. Contatos, oportunidades e a criação da
  primeira clínica **não** exigem AAL2 — o corte exato está em
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
