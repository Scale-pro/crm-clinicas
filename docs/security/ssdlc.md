# SSDLC — Ciclo de desenvolvimento seguro

- **Objetivo:** definir o ciclo seguro de desenvolvimento, do planejamento à
  operação, incluindo o modelo de ameaças.
- **Escopo:** segurança por fase (F0–F7), threat modeling, controles de aplicação,
  cadeia de dependências, testes de segurança, pentest, resposta a incidentes e
  revisão periódica.
- **Responsáveis previstos:** responsável técnico do projeto (dono do SSDLC);
  responsável de segurança *(a designar)*; responsável jurídico/privacidade *(a
  designar)* para itens LGPD.
- **ADRs relacionados:** [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-004](../adr/ADR-004-multitenant-membership-based.md),
  [ADR-005](../adr/ADR-005-superadmin-isolado-e-support-grants.md),
  [ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md),
  [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md).
- **Documentos relacionados:** [deploy-checklist](deploy-checklist.md),
  [data-classification](data-classification.md),
  [shared-responsibility](shared-responsibility.md),
  [pentest-scope](pentest-scope.md), [dr](dr.md),
  [multitenancy-security](../architecture/multitenancy-security.md).
- **Decisões pendentes:** provedor de observabilidade; retenção/anonimização;
  base legal/consentimento; ferramenta de antivírus para uploads.
  Todas marcadas *Pendente de decisão antes do uso de dados reais.*
- **Última revisão:** 2026-07-23.

> Os ADRs são autoritativos. A cibersegurança é critério **bloqueante** de
> lançamento; a F7 **comprova** os controles, não os inicia
> ([ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md)).

## 1. Princípios

- Segurança **distribuída por fase** — cada fase implementa seus controles.
- **Defense-in-depth:** RLS no banco + guard no servidor + validação de entrada +
  UX (PermissionGate) — nenhuma camada isolada é suficiente.
- **Nada de dados reais antes do gate da F7.**

## 2. Segurança por fase (F0–F7)

| Fase | Controles implementados |
|---|---|
| **F0** | Secret scanning; SAST; análise de dependências; separação de ambientes; variáveis seguras; política de atualização de dependências; logs/erros com sanitização; testes de arquitetura (fronteiras). |
| **F1** | RLS; MFA administrativo; rate limiting de auth; proteção de reset de senha e convites; gestão de sessões; backups e PITR *(a validar no plano)*; audit logs; `SECURITY DEFINER` endurecido; support grants auditáveis. |
| **F2** | Validação de entradas; allowlist de campos; anti mass assignment; testes de autorização em Server Actions e Route Handlers. |
| **F3** | Assinatura de webhooks; anti-replay; idempotência; rate limiting; segredos por conexão; segurança do QStash; DLQ; alertas; reconciliação; limites de tamanho de payload. |
| **F4/F5** | Segurança de dados pessoais; consentimento e base legal *(pendente)*; proteção das integrações; retenção/exclusão *(pendente)*; segurança de arquivos, se persistidos. |
| **F7 (gate)** | Pentest; teste de restauração; revisão de RLS; revisão de secrets; revisão da configuração de produção; correção e reteste; checklist final; **aprovação formal para dados reais**. |

## 3. Controles de aplicação

- **Validação de entradas** com Zod na borda; **allowlist de campos** (nunca
  `insert(body)` cru) → anti **mass assignment**.
- **Autorização no servidor** (guard: sessão + tenant + permissão) + **RLS** no
  banco. PermissionGate é só UX
  ([multitenancy-security](../architecture/multitenancy-security.md)).
- **XSS:** escaping por padrão do React; evitar `dangerouslySetInnerHTML`.
- **CSRF:** proteção em mutações sensíveis; cookies `sameSite`.
- **SSRF:** validar/allowlist de URLs de saída em integrações; nunca buscar URL
  arbitrária vinda de payload.
- **Injeções:** consultas parametrizadas; sem concatenação de SQL.
- **Sessões:** cookies `httpOnly`/`secure`/`sameSite`; expiração + rotação;
  revogação no logout.
- **MFA administrativo** (owner/admin/superadmin).
- **Rate limiting** (login, reset, convites, webhooks, APIs).
- **WAF / borda** obrigatório para lançamento (login, reset, convites, webhooks,
  links públicos de tracking, endpoints de integração, painel superadmin).
- **Secrets:** por conexão, cifrados, rotação documentada, nunca no bundle do
  cliente.
- **Webhooks:** assinatura + idempotência + anti-replay + limite de payload
  ([ADR-008](../adr/ADR-008-ingestao-assincrona-adapters-idempotencia.md)).
- **Arquivos/uploads (futuro):** validação de tipo/tamanho, storage isolado por
  clínica, URLs assinadas, **antivírus** *(ferramenta pendente)*.

## 4. Cadeia de dependências

- **SAST**, **análise de dependências** e **secret scanning** no CI (desde F0).
- **Política de atualização de dependências** (cadência + resposta a CVE).
- Revisão obrigatória de migrations, RLS, `SECURITY DEFINER`, autenticação,
  integrações e superadmin (governança de PR — ADR-012).

## 5. Testes de segurança (invariantes)

- **Isolamento multi-tenant** (cross-tenant negado; nenhuma tabela sem RLS).
- **Idempotência de webhook** (reenvio não duplica).
- **Concorrência** (round-robin não duplo-atribui).
- 11 verificações automáticas planejadas para a F0 (ver
  [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md)).

## 6. Pentest, correção e reteste

Ver [pentest-scope](pentest-scope.md). Achados **críticos e altos** corrigidos e
**retestados** antes de qualquer dado real. Prazos de correção por severidade =
*a definir* (não inventar).

## 7. Monitoramento e resposta a incidentes

- Logs de segurança + detecção de anomalia (picos de erro, tentativas de acesso).
- Alertas de DLQ, eventos presos e falhas de Realtime
  ([messaging-attribution](../architecture/messaging-attribution.md)).
- Resposta a incidentes: ver [security-incident](../runbooks/security-incident.md).

## 8. Revisão periódica dos controles

- Revisão dos controles a cada release relevante e em cadência a definir.
- Reavaliação do modelo de ameaças quando entrar nova integração ou superfície.
- `SECURITY DEFINER`, RLS e lista de service role revisados no checklist de deploy.

---

## 9. Modelo de ameaças (seção estruturada)

### 9.1 Ativos protegidos
Dados pessoais de contatos/pacientes; **conteúdo de mensagens** (potencialmente
sensível — ver [data-classification](data-classification.md)); `raw_payload`;
audit logs; support grants; tokens de integração e segredos de webhook; sessões;
isolamento entre clínicas (tenant); disponibilidade do pipeline de mensagens.

### 9.2 Atores legítimos
Usuários da clínica (por papel); superadministrador (só via grant para dados de
clínica); jobs de plataforma (cron/webhooks); provedores externos autenticados.

### 9.3 Possíveis atacantes
Usuário de uma clínica tentando acessar outra; membro com papel inferior tentando
escalar; atacante externo não autenticado; remetente forjando webhook; abuso de
links públicos de tracking; credencial/segredo vazado; dependência comprometida;
insider (superadmin) fora de grant.

### 9.4 Fronteiras de confiança
Internet ↔ Vercel (borda/WAF); aplicação ↔ Supabase (RLS); aplicação ↔ QStash;
aplicação ↔ APIs Meta/Evolution; navegador ↔ links de tracking; CI/CD ↔ segredos
de ambiente; painel clínica ↔ painel plataforma.

### 9.5 Pontos públicos de entrada
Login/reset/convites; endpoints de webhook; links rastreáveis públicos;
callbacks de integração; Realtime.

### 9.6 Superfícies críticas → abuso → impacto → controles → detecção → teste

| Superfície | Possível abuso | Impacto | Controles preventivos | Detecção | Teste |
|---|---|---|---|---|---|
| Login / reset de senha | Brute force, credential stuffing, enumeração | Sequestro de conta | Rate limit, MFA admin, lockout, mensagens neutras | Alerta de logins falhos | pentest auth |
| Convites | Aceite indevido, convite em massa | Acesso não autorizado | Token único/expirável, validação de e-mail, rate limit | Alerta de convites anômalos | teste de convite |
| Painel da clínica | Cross-tenant, escalada | Vazamento entre clínicas | RLS, `has_permission`, guards | Isolamento no CI | isolamento cross-tenant |
| Painel superadmin | Acesso sem grant, ação proibida | Vazamento global | Isolamento, grant escopado/auditado, ações proibidas | Auditoria | superadmin sem grant negado |
| Support grants | Escrita indevida, grant sem expirar | Alteração indevida | Níveis, expiração, ações proibidas, auditoria | Auditoria | grant expirado/proibido negado |
| Server Actions / Route Handlers | Mass assignment, sem guard | Escrita indevida | Zod + allowlist + guard | Testes de autorização | authz em actions/handlers |
| Supabase | RLS ausente, service role indevida | Vazamento/bypass | RLS force, lista fechada, definer endurecido | Catálogo (RLS/PUBLIC) | tabela sem RLS = falha |
| Storage / uploads (futuro) | Upload malicioso, URL vazada | Malware/exposição | Validação, isolamento, URL assinada, antivírus *(pendente)* | Scan de upload | pentest uploads |
| Webhooks | Forjar, replay | Injeção de dados falsos | Assinatura, anti-replay, idempotência, limite de payload | Assinatura inválida recorrente | idempotência/replay |
| Links rastreáveis | Abuso, injeção de UTM, flood | Poluição/atribuição falsa | Validação, rate limit, token não sequencial | Anomalia de cliques | pentest tracking |
| QStash | Chamada forjada ao processor | Processamento indevido | Assinatura/autenticação da fila | Falhas de assinatura | pentest fila |
| WhatsApp/Meta APIs | Payload malformado, mudança de formato | Falha/injeção | Adapter isola, validação, payload cru preservado | Erros de parse | testes de adapter |
| Realtime | Escuta de canal alheio | Vazamento | Canais escopados por `clinic_id` via RLS | Anomalia de assinatura | pentest realtime |
| CI/CD | Segredo exposto, dependência ruim | Comprometimento | Secret scanning, SAST, dep-audit, ambientes separados | Alertas de CI | scan no CI |
| Segredos de ambiente | Vazamento/rotação falha | Comprometimento amplo | Segredos por ambiente, rotação, sem no cliente | Secret scanning | revisão de secrets |

### 9.7 Pendências do modelo de ameaças
- Ferramenta/processo final de **antivírus para uploads**.
  *Pendente de decisão antes do uso de dados reais.*
- **Provedor de observabilidade** para detecção. *Pendente de decisão antes do uso
  de dados reais.*
