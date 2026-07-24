# Contrato de colaboração entre agentes

Este repositório adota o seguinte contrato operacional:

- Claude Code planeja a implementação e revisa o Pull Request.
- Codex implementa o escopo aprovado.
- Nenhum agente trabalha diretamente na `main`.
- Dois agentes nunca alteram simultaneamente a mesma branch.
- Os ADRs aprovados são a fonte autoritativa de arquitetura.
- Uma alteração arquitetural não aprovada gera bloqueio e registro explícito;
  não autoriza improvisação.
- O usuário é responsável pelo merge final.

Em caso de conflito, prevalece a hierarquia registrada em `CLAUDE.md`.
