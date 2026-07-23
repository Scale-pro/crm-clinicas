# Checklist de deploy

- **Objetivo:** garantir que cada deploy passe por verificações de segurança e
  qualidade adequadas ao seu tipo.
- **Escopo:** deploy comum, com migration, com alteração de RLS, com
  `SECURITY DEFINER`, com integração externa, emergencial, e aprovação para
  produção.
- **Responsáveis previstos:** autor do PR (preenche evidências); revisor (valida);
  responsável de segurança *(a designar)* para itens sensíveis; aprovador de
  produção.
- **ADRs relacionados:** [ADR-002](../adr/ADR-002-supabase-acesso-hibrido.md),
  [ADR-004](../adr/ADR-004-multitenant-membership-based.md),
  [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md).
- **Documentos relacionados:** [ssdlc](ssdlc.md), [dr](dr.md),
  [backup-restore](../runbooks/backup-restore.md),
  [../governance/pr-review](../governance/pr-review.md).
- **Decisões pendentes:** provedor de observabilidade (métricas/alertas de deploy).
- **Última revisão:** 2026-07-23.

> Cada item exige **evidência**, **responsável** e **resultado** — não apenas uma
> caixa marcada. Use a tabela de registro (§9).

## 1. Deploy comum (base — sempre)

- [ ] **CI verde** (lint, testes, build). — evidência: link do run.
- [ ] **Testes de isolamento** cross-tenant verdes.
- [ ] **Testes de autorização** (actions/handlers) verdes.
- [ ] **Testes de idempotência** (webhooks) verdes.
- [ ] **Testes de concorrência** (round-robin) verdes.
- [ ] **SAST** sem findings críticos/altos.
- [ ] **Análise de dependências** sem CVE crítico aberto.
- [ ] **Secret scanning** sem exposição.
- [ ] **Sanitização de logs** confirmada (sem PII/`raw_payload`/secrets).
- [ ] **Segredos por ambiente** corretos (nada de produção em outro ambiente).
- [ ] **Métricas e alertas** ativos após deploy *(provedor pendente)*.
- [ ] **Plano de rollback** definido.
- [ ] **Verificação pós-deploy** (smoke) executada.
- [ ] **Compatibilidade entre versões** (sem quebra de contrato de API/DB).

## 2. Deploy com migration (adicional)

- [ ] **Migration revisada** por revisor dedicado.
- [ ] **Versionada e reversível** quando possível; plano de reversão descrito.
- [ ] Nenhuma tabela de tenant criada **sem `clinic_id`** ou **sem RLS**.
- [ ] **Teste de isolamento** adicionado para novas tabelas de tenant.
- [ ] Compatibilidade **forward/backward** (deploy sem downtime): schema tolera a
      versão anterior durante a janela.
- [ ] Backup/PITR confirmado **antes** da migration *(PITR a validar no plano)*.

## 3. Deploy com alteração de RLS (adicional)

- [ ] **RLS habilitado e forçado** (`enable` + `force`) nas tabelas afetadas.
- [ ] Políticas **separadas** SELECT/INSERT/UPDATE/DELETE.
- [ ] **`WITH CHECK`** impede alteração de `clinic_id`.
- [ ] `clinic_id` como **primeira coluna** dos índices compostos afetados.
- [ ] Teste cross-tenant cobrindo as políticas alteradas.
- [ ] Revisão dedicada da mudança de RLS.

## 4. Deploy com `SECURITY DEFINER` (adicional)

- [ ] `search_path` fixo com schemas explícitos.
- [ ] Privilégio mínimo; validação rigorosa da entrada.
- [ ] **`EXECUTE` revogado de `PUBLIC`**; concedido só aos papéis necessários.
- [ ] Verificação no catálogo: nenhuma função definer com `EXECUTE` para `PUBLIC`.
- [ ] Nenhum uso de **service role** fora da lista fechada.
- [ ] Revisão dedicada da função.

## 5. Deploy com integração externa (adicional)

- [ ] **Revisão de arquitetura** antes da integração (SSDLC §3).
- [ ] Assinatura/anti-replay/idempotência do webhook validados.
- [ ] **Segredos por conexão** cifrados; rotação possível.
- [ ] Limite de tamanho de payload aplicado.
- [ ] **DLQ** e **reconciliação** operacionais e monitorados.
- [ ] SSRF: URLs de saída validadas/allowlist.
- [ ] **Feature flags / entitlements** definem quem tem a integração ativa.

## 6. Deploy emergencial (hotfix)

- [ ] Justificativa e aprovação registradas.
- [ ] Escopo mínimo; sem misturar outras mudanças.
- [ ] CI verde **ou** exceção explicitamente aprovada e registrada.
- [ ] Plano de rollback imediato.
- [ ] Revisão retroativa agendada (não pular a revisão, apenas adiar quando crítico).
- [ ] Verificação pós-deploy reforçada.

## 7. Aprovação para produção (gate)

- [ ] Todos os itens aplicáveis acima satisfeitos com evidência.
- [ ] Itens **bloqueantes** do SSDLC/F7 verdes (quando for deploy que habilita
      dados reais).
- [ ] **Backups + PITR** confirmados e **teste de restauração** registrado
      ([backup-restore](../runbooks/backup-restore.md)).
- [ ] Aprovação formal do responsável por produção.
- [ ] **Nenhum dado real antes da aprovação da F7.**

## 8. Verificação pós-deploy

- [ ] Smoke test dos fluxos críticos (login, criar contato, card no Kanban,
      recebimento de webhook de teste).
- [ ] Métricas do pipeline (`webhook_to_opportunity`) dentro do SLO.
- [ ] Sem picos anormais de erro; DLQ vazia ou monitorada.
- [ ] Logs sem PII/secret (amostragem).

## 9. Registro de evidências (modelo)

| Item | Responsável | Resultado (OK/NOK/NA) | Evidência (link/nota) |
|---|---|---|---|
| CI verde | | | |
| Isolamento cross-tenant | | | |
| RLS force + WITH CHECK | | | |
| Definer sem PUBLIC | | | |
| Backup/PITR confirmado | | | |
| Rollback definido | | | |
| Pós-deploy smoke | | | |

## 10. Decisões pendentes

- **Provedor de observabilidade** (para métricas/alertas de deploy).
  *Pendente de decisão antes do uso de dados reais.*
