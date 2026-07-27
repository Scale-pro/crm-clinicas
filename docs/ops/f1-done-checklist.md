# Checklist de conclusão da F1

Este documento é a matriz versionada `requisito → implementação/teste → job → evidência` da F1.10. Nenhum marcador compartilhado é considerado concluído antes de receber um run real e verde.

## Estado da validação

- Branch: `feature/f1-multitenant-auth`.
- PR: #6 (deve permanecer aberto, draft e sem merge).
- SHA-base verde da F1.9: `2ff991bb0f2f7d8e6cb379e9555146e88edf0ee3`.
- SHA revisado formalmente: `16cf072d35772c785e4937216e7cb7e637cacecc`.
- `V-FINAL`: **VALIDADO — correções formais e todos os jobs obrigatórios verdes**.
- `E-FINAL`: CI [run 30290910613](https://github.com/Scale-pro/crm-clinicas/actions/runs/30290910613) e Semgrep [run 30290910594](https://github.com/Scale-pro/crm-clinicas/actions/runs/30290910594).
- `S-FINAL`: `0835f46322249322d5e4cb66361970f214c010eb`, SHA exato da implementação e dos testes validado por todos os jobs.

O commit que registra esta evidência é necessariamente um sucessor apenas
documental de `S-FINAL`: um commit Git não consegue conter literalmente o
próprio hash, pois o hash depende do conteúdo do arquivo. O SHA desse sucessor
e o run que o valida devem constar no relatório final do PR.

## Resultado da execução de referência

| Controle | Resultado |
|---|---|
| Testes locais sem containers | 130 testes em 21 arquivos; sucesso |
| Integração Supabase/Auth/RLS | 71 testes em 11 arquivos; sucesso |
| Migrations em banco vazio (`supabase db reset`) | Sucesso |
| Geração e validação dos tipos locais | Sucesso |
| Lint, typecheck, dependency-cruiser e build | Sucesso |
| Audit high/critical e audit informativo | Sucesso; nenhuma vulnerabilidade conhecida |
| Gitleaks | Sucesso |
| Semgrep | Sucesso |
| Encerramento da stack Supabase (`if: always()`) | Sucesso |

## Correções da revisão formal do PR #6

- B-1: migration aditiva impede convite e aceite para membership ativa ou
  suspensa; `accept_invitation` não usa mais upsert nem altera papel/status.
- H-1: `/platform` e `/platform/clinics/[clinicId]` entregam somente listagem,
  grant `read_only`, revogação e as quatro leituras dedicadas. O
  `SupportModeBanner` só aparece após o grant ser validado no servidor.
- M-1: casos de uso foram movidos para `identity`, `tenancy` e
  `platform-admin`; `shared/auth` possui allowlist transversal testada.
- M-2: ADR-004, regras operacionais e catálogo refletem leitura por RLS e
  escrita RPC-only, com mutações controladas contra DML direto inseguro.
- L-1: cookie da clínica ativa usa `Secure` em staging e production, com testes
  também para development e test.
- L-2/N-4: jobs obrigatórios fazem checkout, conferem e declaram o head SHA.
- N-5: as contagens acima consideram a expansão real de `it.each` no Vitest.

## Referências de testes e jobs

| Código | Evidência executável |
|---|---|
| T-ISO | `tests/integration/tenant-isolation.test.ts` |
| T-SHELL | `tests/integration/authenticated-shell.test.ts`, `tests/architecture/f1-authenticated-shell.test.ts` |
| T-COOKIE | `src/shared/auth/active-clinic-cookie.test.ts`, `src/app/auth/logout/route.test.ts` |
| T-AUTH | `tests/integration/session-auth.test.ts`, `tests/architecture/f1-auth-session.test.ts` |
| T-MFA | `tests/integration/mfa-aal2.test.ts`, `tests/architecture/f1-mfa.test.ts` |
| T-INVITE | `tests/integration/invitations-members.test.ts`, `tests/architecture/f1-invitations.test.ts` |
| T-ONBOARD | `tests/integration/clinic-registration.test.ts`, `tests/architecture/f1-clinic-registration.test.ts` |
| T-SCHEMA | `tests/integration/schema-catalog.test.ts`, `tests/integration/authorization-catalog.test.ts`, testes arquiteturais de migrations |
| T-MUT | `tests/integration/security-catalog-mutations.test.ts` e `tests/integration/helpers/security-catalog.ts` |
| T-DEFINER | `tests/integration/authorization-catalog.test.ts`, `tests/integration/tenant-isolation.test.ts` |
| T-SUPPORT | `tests/integration/platform-support.test.ts`, `tests/architecture/f1-support.test.ts` |
| T-STATIC | `tests/architecture/f1-final-validation.test.ts`, testes de fronteiras, observabilidade e CI |
| T-UI | `tests/architecture/f1-authenticated-shell.test.ts`, `tests/architecture/f1-final-validation.test.ts`, `tests/architecture/f1-support.test.ts`, `src/shared/ui/clinic-selector.test.ts` |
| CI-DB | `.github/workflows/ci.yml`: reset em banco vazio, geração de tipos e suíte de integração |
| CI-SUPPLY | audit high/critical, Gitleaks, dependency-cruiser, build e workflow Semgrep |

## Estratégia de escrita multi-tenant

A F1 autoriza leituras por RLS e mantém as mutações de tenant exclusivamente em
RPCs autorizadas. O papel `authenticated` não possui DML direto nessas tabelas;
a ausência de políticas de escrita é intencional. `T-MUT` também falha se um
`GRANT` direto for introduzido sem política separada, `USING`, `WITH CHECK` e
proteção de `clinic_id`, conforme a emenda da ADR-004.

## Matriz dos 142 requisitos

| # | Requisito | Status | Teste responsável | Job | Evidência final | SHA |
|---:|---|---|---|---|---|---|
| 1 | Usuário da clínica A não lê dados da clínica B. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 2 | Usuário da clínica B não lê dados da clínica A. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 3 | Usuário não insere registros em outra clínica. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 4 | Usuário não altera `clinic_id`. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 5 | Payload controlado pelo cliente não muda o tenant efetivo. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 6 | Rota ou Server Action não aceita `clinic_id` sem revalidação. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 7 | Usuário com múltiplas clínicas acessa somente a clínica ativa validada. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 8 | Troca de clínica não concede acesso a clínica sem membership. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 9 | Membership removida revoga acesso na requisição seguinte. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 10 | Membership suspensa revoga acesso na requisição seguinte. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 11 | Clínica inválida ou indisponível não permanece ativa. | V-FINAL | T-ISO + T-SHELL | database-auth | E-FINAL | S-FINAL |
| 12 | Cookie válido é aceito somente após revalidar membership. | V-FINAL | T-COOKIE + T-SHELL + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 13 | Cookie adulterado é rejeitado. | V-FINAL | T-COOKIE + T-SHELL + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 14 | Assinatura inválida é rejeitada. | V-FINAL | T-COOKIE + T-SHELL + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 15 | Payload malformado é rejeitado. | V-FINAL | T-COOKIE + T-SHELL + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 16 | Clínica inexistente é rejeitada. | V-FINAL | T-COOKIE + T-SHELL + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 17 | Clínica sem membership é rejeitada. | V-FINAL | T-COOKIE + T-SHELL + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 18 | Papel ou permissão não são confiados a partir do cookie. | V-FINAL | T-COOKIE + T-SHELL + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 19 | O segredo HMAC não aparece no bundle cliente. | V-FINAL | T-COOKIE + T-SHELL + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 20 | Alteração e remoção do cookie ocorrem somente no servidor. | V-FINAL | T-COOKIE + T-SHELL + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 21 | Logout invalida sessão e cookie de clínica. | V-FINAL | T-COOKIE + T-SHELL + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 22 | Identidade utiliza `getClaims()` conforme o contrato aprovado. | V-FINAL | T-AUTH + T-STATIC + T-ISO | quality + database-auth | E-FINAL | S-FINAL |
| 23 | Nenhuma autorização sensível depende de `getSession()`. | V-FINAL | T-AUTH + T-STATIC + T-ISO | quality + database-auth | E-FINAL | S-FINAL |
| 24 | Usuário não autenticado não acessa rotas protegidas. | V-FINAL | T-AUTH + T-STATIC + T-ISO | quality + database-auth | E-FINAL | S-FINAL |
| 25 | Toda Server Action revalida autorização no servidor. | V-FINAL | T-AUTH + T-STATIC + T-ISO | quality + database-auth | E-FINAL | S-FINAL |
| 26 | Esconder botão não é a única camada de proteção. | V-FINAL | T-AUTH + T-STATIC + T-ISO | quality + database-auth | E-FINAL | S-FINAL |
| 27 | Papel sem permissão é bloqueado. | V-FINAL | T-AUTH + T-STATIC + T-ISO | quality + database-auth | E-FINAL | S-FINAL |
| 28 | Permissões são avaliadas pelo catálogo, não por comparação espalhada de papel no código. | V-FINAL | T-AUTH + T-STATIC + T-ISO | quality + database-auth | E-FINAL | S-FINAL |
| 29 | Usuário removido perde autorização sem depender de logout manual. | V-FINAL | T-AUTH + T-STATIC + T-ISO | quality + database-auth | E-FINAL | S-FINAL |
| 30 | Nenhuma rota protegida confia em estado React ou `localStorage`. | V-FINAL | T-AUTH + T-STATIC + T-ISO | quality + database-auth | E-FINAL | S-FINAL |
| 31 | Owner precisa de AAL2 nas operações sensíveis. | V-FINAL | T-MFA + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 32 | Admin precisa de AAL2 nas operações sensíveis. | V-FINAL | T-MFA + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 33 | Platform admin precisa de AAL2 nas operações sensíveis aplicáveis. | V-FINAL | T-MFA + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 34 | A exigência ocorre no guard da aplicação. | V-FINAL | T-MFA + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 35 | A exigência também ocorre dentro das RPCs sensíveis. | V-FINAL | T-MFA + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 36 | O banco recusa operação sensível com AAL1 mesmo quando a UI é contornada. | V-FINAL | T-MFA + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 37 | AAL2 é validado para qualquer papel que invoque uma RPC sensível. | V-FINAL | T-MFA + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 38 | MFA incompleto não concede escrita sensível. | V-FINAL | T-MFA + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 39 | Enrollment, challenge e verify respeitam o fluxo existente. | V-FINAL | T-MFA + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 40 | Recuperação de senha não cria bypass de MFA ou autorização. | V-FINAL | T-MFA + T-AUTH | quality + database-auth | E-FINAL | S-FINAL |
| 41 | Convite válido pode ser aceito pela pessoa correta. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 42 | Convite expirado é recusado. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 43 | Convite revogado é recusado. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 44 | Convite já usado é recusado. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 45 | E-mail diferente é recusado. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 46 | Papel do convite não é alterável pelo cliente. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 47 | Convite nunca cria owner. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 48 | Admin não convida outro admin. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 49 | Manager só atribui papéis permitidos. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 50 | Somente owner promove para admin. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 51 | Último owner não pode ser removido. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 52 | Último owner não pode ser suspenso. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 53 | Último owner não pode ter o papel rebaixado. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 54 | Concorrência não deixa a clínica sem owner. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 55 | Duplo-submit não cria membership ou convite duplicado indevido. | V-FINAL | T-INVITE | quality + database-auth | E-FINAL | S-FINAL |
| 56 | `create_clinic_with_owner` é atômico. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 57 | Falha não deixa clínica parcial. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 58 | Clínica nasce com owner ativo. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 59 | Features e limits padrão são criados. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 60 | Activity e auditoria são registradas. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 61 | Duplo-submit não duplica clínica. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 62 | Onboarding não faz múltiplos inserts diretamente pela aplicação. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 63 | Clínica única pode ser selecionada automaticamente. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 64 | Múltiplas clínicas exigem seleção explícita. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 65 | Usuário sem membership recebe o estado correto. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 66 | Onboarding não introduz feature de CRM. | V-FINAL | T-ONBOARD + T-SHELL | quality + database-auth | E-FINAL | S-FINAL |
| 67 | As 13 tabelas previstas existem. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 68 | Todas possuem `ENABLE ROW LEVEL SECURITY`. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 69 | Todas possuem `FORCE ROW LEVEL SECURITY`. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 70 | O teste de catálogo falha de verdade caso uma tabela perca RLS. | V-FINAL | T-MUT | database-auth | E-FINAL | S-FINAL |
| 71 | Tabelas globais também possuem políticas compatíveis. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 72 | Tabelas de tenant sempre filtram por clínica. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 73 | `clinic_id` aparece primeiro nos índices compostos de tenant previstos. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 74 | `activities` permanece append-only. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 75 | `audit_logs` permanece append-only. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 76 | Nenhuma política comum permite alterar ou apagar registros append-only. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 77 | Migrations funcionam desde banco vazio. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 78 | `supabase db reset` funciona. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 79 | Tipos gerados correspondem às migrations. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 80 | Ordem das migrations é reproduzível. | V-FINAL | T-SCHEMA + T-MUT + CI-DB | quality + database-auth | E-FINAL | S-FINAL |
| 81 | Toda função privilegiada possui `search_path` explícito e seguro. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 82 | `EXECUTE` foi revogado de `PUBLIC`. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 83 | Grants foram concedidos somente aos papéis necessários. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 84 | Identidade é validada dentro da função. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 85 | Tenant é validado dentro da função. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 86 | Permissão é validada dentro da função. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 87 | AAL2 é validado dentro da função sensível. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 88 | Parâmetros são tratados como não confiáveis. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 89 | Nenhuma função depende de bypass presumido de RLS. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 90 | O comportamento real sob FORCE RLS é provado por teste. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 91 | `log_audit_event` não é chamável diretamente por `authenticated`. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 92 | `log_audit_event` não é chamável por `anon`. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 93 | Função SECURITY DEFINER não eleva privilégio indevidamente. | V-FINAL | T-DEFINER + T-MUT + T-ISO | database-auth | E-FINAL | S-FINAL |
| 94 | Platform admin sem grant não lê dados de clínica. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 95 | Grant aceita somente `read_only` na F1. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 96 | `support_operations` é recusado. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 97 | `restricted_write` é recusado. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 98 | Grant expirado é inerte. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 99 | Grant revogado é inerte. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 100 | Grant de admin removido de `platform_admins` é inerte. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 101 | Suporte não escreve dados da clínica. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 102 | Suporte não acessa dados via Data API genérica. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 103 | Toda leitura de suporte usa RPC dedicada. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 104 | RPCs utilizam allowlist explícita de colunas. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 105 | Toda leitura de suporte registra auditoria. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 106 | Auditoria contém `support_grant_id`. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 107 | Auditoria contém motivo e contexto aplicáveis. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 108 | Comparação de nível de grant usa enum e não comparação lexical. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 109 | Banner de modo suporte não concede autorização. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 110 | Suporte não altera owner, membros, papéis, MFA ou dados operacionais. | V-FINAL | T-SUPPORT | quality + database-auth | E-FINAL | S-FINAL |
| 111 | Nenhuma service-role key existe em `src`. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 112 | Nenhuma variável de service role é importada pela aplicação. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 113 | Service role de teste permanece apenas no helper autorizado. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 114 | Nenhum segredo real foi commitado. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 115 | Nenhum JWT real foi commitado. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 116 | Nenhuma chave privada foi commitada. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 117 | Nenhum `console.log` fora do mecanismo permitido. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 118 | Logger sanitizado não expõe tokens. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 119 | Logs do CI não imprimem credenciais locais. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 120 | Checkout do job de banco testa o SHA exato da branch. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 121 | CI não testa somente o merge ref temporário. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 122 | GitHub Actions continuam pinadas por SHA completo conforme o padrão. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 123 | Nenhum `continue-on-error` em verificação crítica. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 124 | Nenhum teste crítico está marcado como skip. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 125 | Semgrep permanece verde. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 126 | Gitleaks permanece verde. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 127 | Auditoria de dependências high/critical permanece verde. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 128 | Dependency-cruiser permanece verde. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 129 | Build de produção permanece verde. | V-FINAL | T-STATIC + CI-SUPPLY | quality + dependency-audit + gitleaks + Semgrep | E-FINAL | S-FINAL |
| 130 | Nenhuma funcionalidade da F2 foi introduzida. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 131 | Não existem contatos, pacientes, oportunidades ou pipelines. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 132 | Não existe Kanban. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 133 | Não existe agenda. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 134 | Não existe WhatsApp ou conversa. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 135 | Não existe financeiro ou dashboard fictício. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 136 | Shell apresenta somente funcionalidades da F1. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 137 | Navegação não possui links quebrados. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 138 | Formulários possuem labels. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 139 | Foco por teclado permanece visível. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 140 | Seletor de clínica é acessível. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 141 | Erros não expõem SQL, stack trace, tokens ou IDs sensíveis. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |
| 142 | Responsividade mínima do shell é preservada. | V-FINAL | T-UI + T-STATIC | quality | E-FINAL | S-FINAL |

## Limitações e pendências externas conhecidas

- Docker não está disponível no Mac usado nesta implementação. Os testes de banco, Supabase Auth, MFA, RLS, SECURITY DEFINER e mutações controladas são executados na stack descartável do GitHub Actions em `ubuntu-latest`.
- Nenhuma URL, chave ou credencial de Supabase remoto é usada. O Supabase remoto ainda não está configurado.
- O bootstrap real de `platform_admin` ainda não foi executado; o procedimento permanece documentado no runbook e depende do ambiente de destino.
- O smoke test visual em staging permanece pendente.
- O provedor definitivo de e-mail de produção ainda não foi definido/configurado.
- A recuperação de conta não remove a exigência de MFA nem concede autorização. A recuperação de fatores perdidos exige o procedimento operacional controlado descrito nos ADRs/runbooks; não há bypass automático na F1.
- Estas pendências externas não bloqueiam a conclusão técnica local/CI, mas impedem declarar produção/staging operacionalmente validados.

## Itens deliberadamente adiados

- L-3 (filtro refinado de papéis no formulário) e demais LOW/NOTES não exigidos
  pela revisão formal não foram aplicados automaticamente.
- Transferência de ownership, reativação administrativa de suspensos,
  recuperação administrativa de MFA, envio automático de e-mail e níveis de
  suporte futuros permanecem fora desta correção.
- Leitura avançada de auditoria de plataforma e todas as funcionalidades da F2
  (contatos, pacientes, Kanban, agenda, WhatsApp e financeiro) não foram
  iniciadas.
