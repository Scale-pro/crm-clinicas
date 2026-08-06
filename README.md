# CRM Clínicas

CRM SaaS multi-tenant para clínicas de estética. Em **fase de fundação técnica
(F0)** — nenhuma funcionalidade de produto foi implementada ainda.

## Documentação

Toda a documentação oficial (produto, arquitetura, segurança, operação e
decisões) está em [`docs/README.md`](docs/README.md).

- Regras para agentes e invariantes: [`CLAUDE.md`](CLAUDE.md) e [`AGENTS.md`](AGENTS.md)
- Decisões arquiteturais (autoritativas): [`docs/adr/`](docs/adr/)

## Desenvolvimento

Requisitos: Node.js 22+ (ver `.nvmrc`) e pnpm (ver `packageManager` no
`package.json`).

```bash
pnpm install
pnpm dev        # servidor de desenvolvimento
pnpm build      # build de produção
pnpm lint       # lint
pnpm typecheck  # verificação de tipos
```

### Seed de dados de desenvolvimento (dormante)

`pnpm seed:dev` popula uma stack Supabase **local** com clínica, profissionais,
procedimentos e contatos fictícios. É opt-in e **não roda hoje**: exige um daemon
Docker em execução para subir a stack local, que não existe no ambiente atual do
projeto — e um projeto Supabase hospedado não substitui, porque a guarda de
segurança do script só aceita `127.0.0.1`/`localhost`.

O script está versionado à espera desse ambiente, e nunca foi executado ponta a
ponta. Antes de tentar usá-lo, leia
[`docs/runbooks/seed-dev-data.md`](docs/runbooks/seed-dev-data.md).
