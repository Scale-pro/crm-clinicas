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
pnpm seed:dev   # popula a stack Supabase local com dados fictícios (opt-in)
```

Para popular a stack local com clínica, profissionais, procedimentos e
contatos de exemplo, veja
[`docs/runbooks/seed-dev-data.md`](docs/runbooks/seed-dev-data.md).
