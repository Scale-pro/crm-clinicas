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
| Agendamentos: criar, mudar status, reagendar (PR #21) | — |

> A última linha só existe depois que o PR #21 (agenda) entrar em `main`. Ela
> importa na prática: as ações rápidas da tela de recepção — Chegou, Iniciar,
> Receber — são todas `update_appointment_status`, então **a recepção também
> precisa de TOTP registrado**, não só quem configura a clínica.

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
4. `APP_URL` precisa ser a URL final do deploy, e você só a conhece depois do
   primeiro deploy se não tiver domínio próprio. Isso não trava o build: a
   validação de configuração é preguiçosa (roda na primeira requisição, não no
   import do módulo), então **o deploy sobe mesmo sem `APP_URL` definida**.
   Duas saídas, nenhuma bloqueante:
   - **Domínio próprio**: configure-o antes do primeiro deploy e já cadastre
     `APP_URL` com ele. Um passo só, e é o caminho recomendado.
   - **Domínio da Vercel**: publique primeiro, anote a URL gerada, cadastre
     `APP_URL` com ela e **redeploye**. Antes de cadastrar, qualquer rota
     protegida por sessão responde com o erro claro de configuração ausente
     (nomes das variáveis, nunca valores) em vez de subir quebrada em
     silêncio — mas links de convite e de recuperação de senha ainda não
     funcionam. Não convide ninguém antes de corrigir.
5. Gere o `ACTIVE_CLINIC_COOKIE_SECRET` (mínimo 32 caracteres):

   ```bash
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
   ```

6. Deploy.

Se alguma variável estiver ausente ou inválida, **o build passa** e a falha
aparece na primeira requisição, com uma mensagem citando só os **nomes** das
variáveis — nunca os valores. Cadastre as cinco antes de convidar qualquer
pessoa; o deploy em si não exige isso previamente.

> Isto depende do PR #21 (*"fix(config): não exija segredos de execução para
> compilar"*) já estar em `main`. Antes dele, a validação era *eager* e **o
> build falhava** sem as cinco variáveis — inclusive `APP_URL`, o que exigia o
> contorno de publicar com um valor provisório antes de conhecer a URL final.
> Se você está executando este runbook contra uma `main` anterior ao #21,
> cadastre as cinco variáveis, com `APP_URL` provisória, **antes** do primeiro
> deploy.

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

## Banco existente: diagnóstico e caminhos

As seções 1–6 assumem um projeto **novo**. Antes de rodá-las contra um projeto
que já existe, confirme isso: **ausência de configuração neste repositório não
prova ausência de ambiente.** Supabase e Vercel se conectam pelo painel, não
por arquivo — não há `supabase/.temp/project-ref` versionado, nenhuma variável
de hospedagem no repositório, e mesmo assim um projeto pode estar de pé há
tempo. A única forma confiável de saber é perguntar a quem tem acesso ao
painel, ou consultar o próprio painel.

### Diagnóstico

Rode contra a URI de conexão do projeto (**Project Settings → Database →
Connection string**; mesma URI do passo 3, usada só para consulta):

```bash
# Visão nativa da CLI: compara migrations locais com as já aplicadas.
supabase link --project-ref <ref>
supabase migration list --linked
```

Ou por SQL direto, se preferir ver os dados também:

```sql
-- Migrations aplicadas, na ordem em que foram aplicadas (não a de arquivo).
select version, name from supabase_migrations.schema_migrations order by version;

-- Tabelas existentes em public — compare com o que cada PR pendente cria.
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;

-- Sinal de dado de teste "pendurado".
select 'clinics' t, count(*) from public.clinics
union all select 'clinic_members', count(*) from public.clinic_members
union all select 'contacts', count(*) from public.contacts
union all select 'auth.users', count(*) from auth.users;
```

O sintoma que motivou esta seção: `version` mais recente em
`schema_migrations` correspondendo a um arquivo `20260805_*` (agendamentos,
PR #21) enquanto um arquivo `20260730_*` (WhatsApp, PR #18) — de nome
**anterior** — não aparece na lista. Isso acontece quando PRs são aplicados na
ordem em que ficam prontos no painel de quem opera, não na ordem de nome de
arquivo. `supabase db push` (sem flag) **recusa** aplicar um arquivo mais
antigo que o último já aplicado — é essa recusa que expõe o desalinhamento.

Três caminhos, na ordem em que vale tentar: **C primeiro** — resolve o
sintoma (histórico fora de ordem) sem tocar em nada além dele. Caia para A só
se C não servir (ex.: o banco está numa bagunça maior que só migration fora
de ordem). Caia para B só se houver dado que precise sobreviver e resetar não
for opção.

### Caminho C — completar só o que falta, sem resetar (o mais cirúrgico)

Use quando o diagnóstico mostra exatamente o sintoma desta seção: um
intervalo de arquivos de migration **não aplicado**, intercalado entre
versões que já foram — não o banco inteiro fora de sincronia. Verificado em
produção neste projeto: aplicado pelo SQL Editor do painel, sem CLI, sem
tocar em Auth, credenciais ou no restante do schema.

O que resolve isto, e o que não: `delete from
supabase_migrations.schema_migrations` seguido de reaplicar **tudo** do zero
**não é seguro** — nenhuma migration deste repositório usa
`create table if not exists`, então a primeira tabela que já existe (a
primeira migration de F1) derruba a reaplicação com "relation already
exists". A tabela de histórico não é o schema; apagá-la não desfaz o que já
foi criado, só faz a CLI tentar recriar.

O caminho seguro é o oposto: **não apague nada da tabela de histórico, só
complete o que falta.**

1. Identifique os arquivos de migration que o diagnóstico mostrou como
   ausentes — o intervalo entre a última versão aplicada antes do buraco e a
   primeira depois dele.
2. Cole o conteúdo de cada um no SQL Editor, **na ordem exata do nome de
   arquivo**, um de cada vez, conferindo "Success" antes do próximo — arquivos
   da mesma leva costumam depender uns dos outros (RPC que referencia tabela
   ou função do arquivo anterior).
3. Confirme que os objetos foram criados (ex.: `select table_name from
   information_schema.tables where table_name = '<tabela nova>';`).
4. Registre as versões aplicadas na tabela de histórico — a única escrita
   nela, e é um `insert`, nunca um `delete`:

   ```sql
   -- Confira as colunas reais antes de escrever o insert; o formato mais
   -- comum é (version, name), mas não assuma sem checar.
   select * from supabase_migrations.schema_migrations limit 3;

   insert into supabase_migrations.schema_migrations (version, name) values
     ('<versão1>', '<nome_do_arquivo_1>'),
     ('<versão2>', '<nome_do_arquivo_2>');
   ```

5. Confirme a posição: `select version, name from
   supabase_migrations.schema_migrations order by version;` — as versões
   novas devem aparecer entre as vizinhas corretas, não no fim.

Depois disso, `supabase migration list --linked` (quando alguém rodar com CLI
e rede) não mostra pendência, e um `db push` futuro não recusa por ordem —
do ponto de vista da tabela, essas versões sempre estiveram lá.

### Caminho A — resetar do zero (quando C não se aplica e o dado é descartável)

Só se **todo** o conteúdo do banco for fictício e descartável — confirme por
uma leitura, não por suposição (ver diagnóstico acima). Se houver qualquer
dado que importe, use o Caminho B.

```bash
supabase link --project-ref <ref>
supabase db reset --help        # confirma que --linked existe nesta versão da CLI antes de rodar
supabase db reset --linked
```

O que isso faz: derruba e recria os schemas que as migrations possuem
(`public`, `app_private`), zera `supabase_migrations.schema_migrations` e
reaplica **todo** arquivo de `supabase/migrations/` em ordem de nome, do zero
— depois roda `supabase/seed.sql` (vazio, então nada é semeado). Ao final, a
ordem de aplicação no banco volta a bater com a ordem de arquivo do
repositório, e o problema de timestamp deixa de existir — não só para este
caso, para qualquer PR futuro.

O que **não** é afetado: configuração de Auth do painel (Site URL, redirects,
MFA/TOTP habilitado, política de senha, confirmação de e-mail — seção 4 deste
runbook) vive fora dos schemas `public`/`app_private`, então sobrevive ao
reset. Storage e Realtime também não são tocados — nenhuma migration deste
repositório os usa.

O que **não** é afetado automaticamente, e precisa de passo à parte:
`auth.users`. GoTrue (o serviço de Auth) não é gerido pelas migrations deste
repositório — `db reset --linked` não os apaga. Com poucos usuários de teste, é
mais simples apagar pelo painel (**Authentication → Users**, um a um) do que
por SQL direto na tabela.

Se `--linked` não existir na versão instalada da CLI, o caminho alternativo é
manual — e mais arriscado, porque recriar o schema `public` derruba os grants
padrão que a plataforma espera até as migrations rodarem de novo:

```sql
drop schema if exists app_private cascade;
drop schema public cascade;
create schema public;
delete from supabase_migrations.schema_migrations;
```

seguido de:

```bash
supabase db push --db-url "$SUPABASE_DB_URL"
```

(sem `--include-all`: com a tabela de histórico vazia, todo arquivo local já
conta como novo e é aplicado em ordem de nome.)

**Antes:** confirme o `project-ref` contra o Project URL do painel (nunca
rode isto sem essa confirmação); anote os e-mails dos usuários de teste, se
quiser recriá-los rápido depois.

**Depois:** `supabase migration list --linked` sem pendência dos dois lados;
`conversations` e `appointments` presentes em `information_schema.tables`
(prova que #18 e #21 aplicaram); contagens de tabela de tenant zeradas;
`select count(*) from auth.users` conforme o passo de limpeza escolhido.

### Caminho B — aplicar por cima, sem resetar (`--include-all`)

Use quando há dado que precisa sobreviver.

```bash
supabase db push --db-url "$SUPABASE_DB_URL" --include-all
```

Aplica todo arquivo local ainda não registrado como aplicado, **ignorando** a
checagem de ordem. Funciona porque as migrations do PR #18 não compartilham
tabela, política nem permissão com as do PR #21 (verificado por leitura antes
de recomendar isto). O dado existente permanece.

O que este caminho **não resolve**: a ordem registrada em
`schema_migrations` continua divergente da ordem de arquivo — o
`20260805_*` fica marcado como aplicado antes do `20260730_*`. Um PR futuro
com arquivo datado antes de ambos reproduziria o mesmo impasse. É o
contorno, não a correção — use só quando resetar não for opção.

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
ambiente; o primeiro muda o passo 6. O item 2 já tem correção mesclada em
`main` (fora deste PR) e fica registrado como histórico, não como pendência.

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

### 2. ~~A validação de configuração era *eager*~~ — RESOLVIDO pelo PR #21

Até o commit *"fix(config): não exija segredos de execução para compilar"*
(PR #21), `src/shared/config/index.ts` validava no import do módulo. Como
`next build` importa os módulos de rota, **compilar exigia as variáveis de
execução** — inclusive `APP_URL`, que só se conhece depois do primeiro deploy
quando não há domínio próprio.

O PR #21 tornou a leitura preguiçosa e memoizada: o build deixa de exigir
segredo, e a primeira requisição mal configurada continua falhando alto. O
passo 5 já assume esse comportamento — a nota histórica ali explica o que
mudou para quem executa contra uma `main` anterior ao #21.

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
