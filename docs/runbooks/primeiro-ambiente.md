# Runbook — Provisionar o primeiro ambiente real

- **Objetivo:** sair de "nenhum serviço conectado" para uma aplicação de pé, com
  Supabase hospedado e deploy na Vercel, sem Docker na máquina de quem executa.
- **Escopo:** primeiro ambiente (`staging`). Produção só depois do gate F7
  ([ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md)).
- **Pré-requisitos:** conta Supabase, conta Vercel, acesso de escrita ao
  repositório, Node 22 e pnpm locais.
- **ADRs relacionados:** [ADR-001](../adr/ADR-001-hospedagem-vercel.md),
  [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md).
- **Documentos relacionados:** [../ops/environments](../ops/environments.md),
  [bootstrap-platform-admin](bootstrap-platform-admin.md),
  [../security/deploy-checklist](../security/deploy-checklist.md).
- **Última revisão:** 2026-08-06.

> **Leia antes de começar:** a seção [Bloqueios conhecidos](#bloqueios-conhecidos)
> lista o que hoje atrapalha rodar hospedado. Nenhum deles impede subir o
> ambiente, mas o passo 6 depende de conhecer o primeiro item.

> **Dados fictícios apenas.** Até o gate F7 nenhum ambiente recebe dado real de
> paciente. Use nomes e telefones inventados.

---

## 1. Criar o projeto Supabase

1. No painel do Supabase, **New project**.
2. Anote a região (prefira uma próxima ao público final; a latência do banco é o
   custo dominante nas telas de agenda).
3. Guarde a **senha do banco** que o painel pede — ela entra na URL de conexão do
   passo 3 e não é recuperável depois, só redefinível.
4. Espere o provisionamento terminar antes de seguir.

Nada mais é necessário aqui: as migrations criam o schema `app_private`, as
tabelas, as políticas e as funções. **Nenhuma extensão extra é exigida** — as
migrations não usam `pg_cron`, `pg_net`, `vault` nem `create extension`.

## 2. Coletar as credenciais

No painel do projeto, em **Project Settings → API**:

| O que copiar | Onde aparece | Vira a variável |
|---|---|---|
| Project URL | API Settings | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (ou `anon`) | API Settings | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |

Em **Project Settings → Database → Connection string**, copie a URI de conexão
direta — ela é usada **uma vez**, no passo 3, e não vira variável da aplicação.

> A `service_role` / `secret key` **não** é usada pela aplicação. Não a coloque
> na Vercel. O código não a lê em lugar nenhum de `src/` — o acesso de usuário é
> sempre pela sessão/JWT ([ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md)).

## 3. Aplicar as migrations

Da raiz do repositório, com a branch que você quer publicar:

```bash
pnpm install

# A senha do banco vai na URI. Passe por variável para não deixar no histórico.
read -rs SUPABASE_DB_URL          # cole a connection string e dê Enter
pnpm supabase db push --db-url "$SUPABASE_DB_URL"
```

> A CLI exige a URI **percent-encoded**. Se a senha do banco tiver `@`, `/`,
> `#`, `?`, `:` ou espaço, a conexão falha com erro de parsing — que não parece
> um problema de senha. Codifique só a senha antes de montar a URI:
>
> ```bash
> node -e "process.stdout.write(encodeURIComponent(process.argv[1]))" 'SUA-SENHA'
> ```

`db push` aplica, em ordem, tudo em `supabase/migrations/`. Confira ao final que
a contagem de migrations aplicadas bate com a de arquivos no diretório.

`supabase/seed.sql` é intencionalmente vazio: **nenhum dado é semeado**. Clínica
e usuário nascem no passo 6.

> Para popular um ambiente de desenvolvimento com dados fictícios depois, há um
> script separado e opt-in proposto no PR #23 (`runbooks/seed-dev-data.md`).
> Ele não está na `main` ainda, e **não** é para ambiente hospedado.

## 4. Configurar o Auth do projeto

O `supabase/config.toml` do repositório configura **apenas a stack local**. O
projeto hospedado é configurado pelo painel, e alguns valores precisam bater com
o que a aplicação espera. Em **Authentication → URL Configuration**:

| Campo | Valor | Por quê |
|---|---|---|
| Site URL | a URL pública da aplicação (a mesma do `APP_URL`) | destino padrão dos links de e-mail; ver [Bloqueios conhecidos](#bloqueios-conhecidos) |
| Redirect URLs | `<APP_URL>/auth/callback` | a recuperação de senha aponta explicitamente para cá |

Em **Authentication → Providers → Email**: mantenha e-mail/senha habilitado.
Decida sobre **Confirm email** — o efeito está detalhado no passo 6.

Em **Authentication → Multi-Factor Authentication**: habilite **TOTP (app
authenticator)**. Sem isso o usuário não consegue registrar um segundo fator, e
tudo que exige `app_private.require_aal2()` fica inacessível.

O corte é específico, e vale conhecê-lo para não diagnosticar errado:

| Exige AAL2 | Não exige |
|---|---|
| Configurações da clínica | Criação da clínica (`create_clinic_with_owner`) |
| Convites e gestão de membros | Contatos e métodos de contato |
| Pipelines e etapas | Oportunidades (criar, mover, fechar, atribuir) |
| Profissionais e disponibilidade | Origens de lead |
| Procedimentos e vínculos | — |
| Reabrir oportunidade, suporte de plataforma | — |

Ou seja: **o onboarding do passo 6 funciona antes do MFA** — de propósito, senão
seria impossível criar a primeira clínica. O que trava sem TOTP é a configuração
da operação: cadastrar profissional, procedimento, pipeline e convidar equipe.

O local usa `minimum_password_length = 6`. Para um ambiente exposto, suba esse
mínimo no painel; o schema da aplicação não impõe tamanho próprio.

## 5. Configurar e publicar na Vercel

1. **Import Project** apontando para o repositório.
2. Framework: Next.js. Build e install são detectados; o `packageManager` do
   `package.json` fixa o pnpm.
3. Em **Settings → Environment Variables**, cadastre as cinco variáveis da
   tabela em [environments](../ops/environments.md#3-inventário-de-variáveis).
   Marque o ambiente (Preview/Production) correspondente.
4. `APP_URL` precisa ser a URL final do deploy, mas o build exige a variável
   **antes** de existir uma URL. Duas saídas:
   - **Domínio próprio**: configure-o antes do primeiro deploy e já cadastre
     `APP_URL` com ele. Um passo só, e é o caminho recomendado.
   - **Domínio da Vercel**: cadastre um valor provisório sintaticamente válido
     (qualquer URL), publique, anote a URL gerada, corrija `APP_URL` e
     **redeploye**. Enquanto estiver provisório, links de convite e de
     recuperação de senha apontam para o lugar errado — não convide ninguém
     antes de corrigir.
5. Gere o `ACTIVE_CLINIC_COOKIE_SECRET` (mínimo 32 caracteres):

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

6. Deploy.

Se alguma variável estiver ausente ou inválida, **o build falha**, com uma
mensagem citando só os **nomes** das variáveis. Cadastre as cinco antes do
primeiro deploy — inclusive `APP_URL`, mesmo que provisória. Ver o bloqueio 2
abaixo.

## 6. Criar o primeiro usuário e a primeira clínica

Não há seed nem script: o caminho é a própria aplicação, porque a criação é
atômica e registra o criador como `owner`.

1. Acesse `<APP_URL>/register` e cadastre e-mail, nome e senha.
2. **Confirme o e-mail.** A RPC de criação de clínica exige
   `email_confirmed_at` preenchido; sem isso ela recusa com "confirmed account
   required". Dois caminhos:
   - **Confirm email ligado** (padrão do Supabase hospedado): clique no link do
     e-mail. Leia o primeiro item de [Bloqueios conhecidos](#bloqueios-conhecidos)
     antes — o destino do link depende do Site URL.
   - **Confirm email desligado**: o Supabase confirma na hora e o cadastro cai
     direto em `/onboarding`. Mais simples para o primeiro ambiente; ligue a
     confirmação depois.
   - Alternativa sem e-mail: confirmar o usuário manualmente pelo painel
     (**Authentication → Users**).
3. Já autenticado, a aplicação leva a `/onboarding`. Informe nome, identificador
   (minúsculas, números e hífens) e fuso horário. Ao enviar, a RPC
   `create_clinic_with_owner` cria clínica, vínculo de `owner`, features e
   limites — tudo numa transação.

   > A função chama-se **`create_clinic_with_owner`**, não `register_clinic`.
   > É `SECURITY DEFINER`, validada, e roda com a sessão do usuário — não com
   > `service role`.

4. Registre o segundo fator: acesse `/mfa` e cadastre o TOTP. Sem isso, as
   telas de configuração recusam qualquer escrita.
5. Convide o restante da equipe pela tela de time. Convite também é RPC
   autorizada; não crie usuários direto no painel do Supabase, porque eles
   nasceriam sem vínculo de clínica.

Para conceder acesso de plataforma (superadmin), siga
[bootstrap-platform-admin](bootstrap-platform-admin.md) — é procedimento manual,
de duas pessoas, e nunca sai de migration ou seed.

## 7. Verificar

- [ ] `<APP_URL>/login` responde e o CSS carrega.
- [ ] Login entra e cai em `/app`.
- [ ] O nome da clínica aparece no seletor de clínica.
- [ ] Uma escrita simples funciona **após** o TOTP (criar um profissional).
- [ ] Sem TOTP, a mesma escrita é recusada — prova que `require_aal2` está ativo.
- [ ] Sair e voltar preserva a clínica ativa (prova que o cookie assinado está
      funcionando, logo `ACTIVE_CLINIC_COOKIE_SECRET` está correto).

---

## Bloqueios conhecidos

Levantados no código, **não corrigidos** neste documento. Nenhum impede subir o
ambiente; o primeiro muda o passo 6.

### 1. `signUp` não define `emailRedirectTo`

`registerAccount` (`src/modules/identity/registration.ts`) chama
`supabase.auth.signUp()` sem `options.emailRedirectTo`. O link de confirmação
usa então o **Site URL** do projeto como destino.

Consequência: se o Site URL não for uma rota capaz de trocar o `code` por
sessão, o clique no e-mail leva a uma página que não conclui a confirmação. A
recuperação de senha **não** tem esse problema — ela passa
`redirectTo: <APP_URL>/auth/callback?next=/reset-password` explicitamente
(`src/modules/identity/account-security.ts`).

Contorno até corrigir: desligar **Confirm email** no primeiro ambiente, ou
confirmar o usuário pelo painel.

### 2. A validação de configuração é *eager*, então o build exige os segredos

`src/shared/config/index.ts` valida no import do módulo. Como `next build`
importa os módulos de rota, **compilar exige as variáveis de execução** —
inclusive `APP_URL`, que só se conhece depois do primeiro deploy quando não há
domínio próprio (daí o contorno no passo 5).

Já existe correção pronta fora da `main`: o PR #21 traz o commit
*"fix(config): não exija segredos de execução para compilar"*, que torna a
leitura preguiçosa e memoizada — o build deixa de exigir segredo e a primeira
requisição mal configurada continua falhando alto. Depois que aquele PR entrar,
este bloqueio deixa de valer e o passo 5 pode ser simplificado.

### 3. `pnpm db:types` só funciona contra a stack local

O script é `supabase gen types typescript --local`. Contra um projeto hospedado
seria preciso `--project-id`. Afeta apenas a geração de tipos no
desenvolvimento, não a aplicação em execução.

### 4. `supabase/config.toml` descreve só o ambiente local

`site_url = "http://127.0.0.1:3000"`, `additional_redirect_urls`,
`enable_confirmations = false` e `minimum_password_length = 6` valem para
`supabase start`. **Nada disso é aplicado ao projeto hospedado** — daí o passo 4
existir. Hoje não há nenhum arquivo versionado que descreva a configuração de
Auth do ambiente real, então essa configuração vive apenas no painel e não é
revisável por PR.

### 5. A suíte de integração é local por construção

`tests/integration/helpers/create-test-admin-client.ts` recusa qualquer URL que
não seja loopback, e o CI sobe um Supabase efêmero. Isso é **intencional** e não
deve ser afrouxado: é o que impede um teste destrutivo de apontar para um
ambiente real. A consequência é que `pnpm test:db` continua exigindo Docker e não
valida o ambiente hospedado — a verificação do passo 7 é manual.

### 6. Nenhuma variável de fila, e nenhuma fila

`src/shared/queue/index.ts` expõe só o contrato e um publicador no-op que
responde `not_configured`. Não há SDK, credencial nem variável de QStash —
elas chegam na F3, junto da ingestão de WhatsApp. Se você procurava as
"variáveis da fila" para cadastrar agora: não existem, e cadastrar chaves
antecipadamente contraria [environments](../ops/environments.md).

### 7. Nenhuma variável de observabilidade

`src/shared/observability` escreve no `console` do runtime, sanitizado por
`redact.ts`. Não há Sentry nem provedor externo: a escolha continua pendente
([ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md)). Na Vercel, os
logs ficam no painel de Runtime Logs — cuja retenção depende do plano, e isso é
uma decisão a tomar antes de produção.
