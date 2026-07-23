# Responsabilidade compartilhada

- **Objetivo:** esclarecer quem responde por cada aspecto de segurança e
  operação entre a aplicação, o operador, as clínicas e os fornecedores.
- **Escopo:** matriz de responsabilidade por parte e inventário de
  subprocessadores.
- **Responsáveis previstos:** operador da plataforma; responsável de segurança
  *(a designar)*; responsável jurídico/privacidade *(a designar)*.
- **ADRs relacionados:** [ADR-001](../adr/ADR-001-hospedagem-vercel.md),
  [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-009](../adr/ADR-009-fila-qstash-substituivel.md),
  [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md).
- **Documentos relacionados:** [ssdlc](ssdlc.md),
  [data-classification](data-classification.md), [dr](dr.md),
  [../runbooks/provider-outage](../runbooks/provider-outage.md).
- **Decisões pendentes:** provedor de e-mail; provedor de observabilidade;
  operador do Evolution API; subprocessadores futuros; validação do plano com PITR.
- **Última revisão:** 2026-07-23.

> **Regra:** recursos contratados **não** são tratados como existentes sem
> confirmação. Ex.: **PITR** é **requisito a validar no plano efetivamente
> contratado antes da produção**, não um fato presumido.

## 1. Como ler a matriz

Cada linha indica a **responsabilidade primária**. Muitos itens são
**compartilhados**: o fornecedor provê a capacidade e **nós** configuramos e
verificamos. "Nós" = nossa aplicação/operador da plataforma.

## 2. Matriz de responsabilidade

| Aspecto | Nós (app/operador) | Clínica cliente | Vercel | Supabase | Upstash/QStash | Meta / WhatsApp Cloud | Evolution API (operador) | E-mail (futuro) | Observabilidade (futuro) | GitHub |
|---|---|---|---|---|---|---|---|---|---|---|
| Infraestrutura | Config e uso correto | — | **Provê** | **Provê** | **Provê** | Provê API | Provê/host | Provê | Provê | Provê |
| Disponibilidade | Arquitetura resiliente | — | **SLA da Vercel** | **SLA do Supabase** | **SLA do QStash** | SLA Meta | *a validar* | SLA | SLA | SLA |
| Backup | Estratégia + teste de restauração | — | — | **Recurso** (PITR *a validar*) | Reentrega/retry | — | *a validar* | — | — | Repositório |
| Autenticação | Integrar Supabase Auth, MFA admin | Gerir seus usuários | — | **Provê Auth** | — | Chaves de API | Credenciais de instância | — | — | Acesso ao repo |
| Autorização | RLS + guards + permissões | Definir papéis internos | — | Aplica RLS | — | — | — | — | — | Branch protection |
| Criptografia | Em repouso da app, cifrar segredos | — | TLS/borda | Em repouso/trânsito | Em trânsito | Em trânsito | *a validar* | Em trânsito | *a validar* | Em repouso |
| Logs | Sanitização central | — | Logs de plataforma | Logs de DB | Logs de fila | — | *a validar* | — | Recebe (sanitizado) | Logs de CI |
| Vulnerabilidades | SAST/dep-audit/patch | — | Plataforma | Plataforma | Plataforma | Plataforma | *a validar* | Plataforma | Plataforma | Dependabot |
| Segredos | Gestão/rotação por conexão | — | Env vars | Chaves de projeto | Token de fila | App secret | Segredo de instância | API key | Token | Secrets do CI |
| Webhooks | Assinatura/anti-replay/idempotência | — | — | — | Assinatura de entrega | Assina eventos | *a validar* assinatura | — | — | — |
| Incidentes | Detecção/resposta/comunicação | Reportar suspeitas | Status page | Status page | Status page | Status page | *a validar* | Status page | Status page | Status page |
| Retenção | Política + execução | Definir preferências no contrato | — | Armazena | Retenção de fila | Retenção Meta | *a validar* | — | Retenção de logs | Histórico |
| Exclusão | Executar exclusão/anonimização | Solicitar | — | Executa no DB | Expira jobs | Conforme Meta | *a validar* | — | Conforme provedor | — |
| Solicitações dos titulares (LGPD) | Operacionalizar acesso/correção/exclusão | Repassar solicitações dos seus pacientes | — | — | — | — | — | — | — | — |
| Comunicação de indisponibilidade | Notificar clínicas afetadas | — | Status page | Status page | Status page | Status page | *a validar* | Status page | Status page | Status page |

*"a validar"* = depende de confirmação contratual/técnica antes da produção.

## 3. Papéis LGPD (a confirmar com jurídico)

- **Clínica:** tende a ser **controladora** dos dados dos seus pacientes.
- **Nós:** tendemos a ser **operador/processador** para as clínicas, e
  **controlador** dos dados da própria conta/equipe.
- **Fornecedores:** **subprocessadores**.
Estes papéis **devem ser confirmados por revisão jurídica** antes da produção —
esta documentação não os define legalmente.

## 4. Inventário de subprocessadores

| Subprocessador | Função | Status |
|---|---|---|
| Vercel | Hospedagem/borda | **Confirmado** (ADR-001) |
| Supabase | Banco/Auth/Storage/Realtime | **Confirmado** (ADR-002) |
| Upstash/QStash | Fila assíncrona | **Confirmado** (ADR-009) |
| Meta / WhatsApp Cloud API | Canal oficial + atribuição | **Planejado** (F3/F5) |
| Evolution API (operador) | Canal por instância | **Planejado / operador a definir** |
| GitHub | Código/CI | **Confirmado** |
| Provedor de e-mail | Transacional/convites | **Pendente de escolha** |
| Provedor de observabilidade | Logs/erros/métricas | **Pendente de escolha** |
| Outros futuros | — | **Pendente de escolha** |

## 5. Decisões pendentes

- **Validação do plano contratado com PITR** (Supabase) antes da produção.
- **Provedor de e-mail** e **provedor de observabilidade**.
- **Operador do Evolution API** e demais subprocessadores futuros.
Todos: *Pendente de decisão antes do uso de dados reais.*
