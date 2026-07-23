# AGENTS.md

Orientação curta para qualquer agente de IA (Claude Code ou outro) que trabalhe
neste repositório. Existe **uma única fonte de regras operacionais**: o
[`CLAUDE.md`](CLAUDE.md). Este arquivo apenas aponta para lá — não duplica regras
para evitar fontes conflitantes.

## Comece por aqui

1. Leia o [`CLAUDE.md`](CLAUDE.md) — regras operacionais e invariantes.
2. Leia os ADRs relevantes em [`docs/adr/`](docs/adr/) — **fonte autoritativa**
   das decisões.
3. Consulte o índice da documentação em [`docs/README.md`](docs/README.md).

## Regras de ouro

- **ADR aprovado prevalece.** O código não pode contradizê-lo. Para mudar uma
  decisão, abra um novo ADR (`docs/adr/ADR-template.md`) — nunca altere a
  arquitetura silenciosamente.
- Não invente números pendentes (RPO, RTO, retenção de payload): trate-os como
  **decisões pendentes explícitas**.
- Toda alteração importante vai por **Pull Request** com CI verde e o checklist
  arquitetural e de segurança preenchido.

## Hierarquia das fontes de verdade

ADRs → documentos de arquitetura → `CLAUDE.md` → `AGENTS.md` → testes de
invariantes. Em conflito, a ordem acima decide; o ADR vence.
