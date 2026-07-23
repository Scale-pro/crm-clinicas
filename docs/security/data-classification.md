# Classificação de dados

- **Objetivo:** classificar os dados do produto e definir seu tratamento
  (acesso, logs, criptografia, retenção, exclusão, auditoria, risco).
- **Escopo:** categorias de classificação, inventário de dados e regras de
  tratamento por categoria.
- **Responsáveis previstos:** responsável de segurança *(a designar)*; responsável
  jurídico/privacidade *(a designar)*; responsável técnico.
- **ADRs relacionados:** [ADR-006](../adr/ADR-006-modelo-de-dominio-pessoa-e-convencoes.md),
  [ADR-005](../adr/ADR-005-superadmin-isolado-e-support-grants.md),
  [ADR-007](../adr/ADR-007-atribuicao-multitouch.md),
  [ADR-012](../adr/ADR-012-seguranca-por-fase-e-governanca.md).
- **Documentos relacionados:** [ssdlc](ssdlc.md),
  [shared-responsibility](shared-responsibility.md), [dr](dr.md),
  [../architecture/data-model](../architecture/data-model.md).
- **Decisões pendentes:** prazos de retenção/anonimização/exclusão; base legal e
  consentimento por finalidade. *Pendente de decisão antes do uso de dados reais.*
- **Última revisão:** 2026-07-23.

## 1. Categorias

| Categoria | Definição |
|---|---|
| **Público** | Pode ser divulgado sem risco (ex.: nome comercial da clínica, se público). |
| **Interno** | Uso interno; sem PII (ex.: configurações não sensíveis, métricas técnicas agregadas). |
| **Confidencial** | Dado de negócio da clínica (ex.: orçamentos, pipeline) — isolado por tenant. |
| **Dado pessoal** | Identifica uma pessoa (nome, telefone, e-mail, IP). |
| **Dado pessoal sensível** | Saúde e correlatos. **Inclui conteúdo de mensagem** que pode revelar saúde. |
| **Segredo/credencial** | Tokens de integração, segredos de webhook, chaves. |
| **Segurança/auditoria** | Audit logs, support grants — registros de integridade. |

> **Ponto crítico:** uma mensagem de WhatsApp pode conter espontaneamente
> informação de saúde. Portanto, **o conteúdo da mensagem é tratado como dado
> pessoal potencialmente sensível**, mesmo o produto **não** tendo prontuário
> clínico.

## 2. Inventário e classificação

| Dado | Categoria | Observação |
|---|---|---|
| Dados de usuários (equipe) | Dado pessoal | perfil, e-mail de login |
| Dados de contatos | Dado pessoal | pessoa da clínica |
| Telefones | Dado pessoal | E.164; nunca completo em logs |
| E-mails | Dado pessoal | normalizado |
| Conversas | Dado pessoal **sensível** (potencial) | metadados + conteúdo |
| Conteúdo de mensagens | Dado pessoal **sensível** (potencial) | pode conter saúde |
| Mídias | Dado pessoal **sensível** (potencial) | imagens/áudio |
| Dados de pacientes | Dado pessoal (extensão do contato) | sem prontuário |
| Agendamentos | Confidencial + dado pessoal | horário/profissional |
| Procedimentos | Confidencial | catálogo por clínica |
| Orçamentos | Confidencial | valores |
| Referral do Meta | Dado pessoal + confidencial | atribuição |
| `ctwa_clid` | Identificador de atribuição | correlação |
| UTMs | Interno/atribuição | pode ter baixa sensibilidade |
| `fbclid` | Identificador de atribuição | correlação |
| IP | Dado pessoal | quando coletado |
| User agent | Dado pessoal (fraco) | quando coletado |
| Tracking tokens | Confidencial | uso único/validade |
| Raw payload | Dado pessoal **sensível** (potencial) | acesso extremamente restrito |
| Audit logs | Segurança/auditoria | append-only |
| Support grants | Segurança/auditoria | com motivo |
| Tokens de integração | Segredo/credencial | cifrado |
| Segredos de webhook | Segredo/credencial | por conexão, cifrado |
| Backups | Espelham a classe do dado contido | tratados como o dado mais sensível |

## 3. Regras de tratamento por categoria

Para cada categoria: finalidade, armazenamento, quem acessa / quem **não** acessa,
uso em logs, criptografia, backup, exportação, retenção, anonimização, exclusão,
auditoria e risco de vazamento.

### 3.1 Dado pessoal / dado pessoal sensível (inclui conteúdo de mensagem, raw_payload)
- **Finalidade:** operar o CRM (atendimento, agenda, atribuição) — base legal
  *pendente*.
- **Armazenamento:** Postgres (RLS por tenant); mídias em storage isolado por
  clínica.
- **Acessa:** membros da clínica conforme papel; superadmin **apenas** via support
  grant auditado. **Não acessa:** outras clínicas; superadmin sem grant;
  ferramentas de monitoramento.
- **Logs:** **proibido** — corpo de mensagem, telefone completo, e-mail, nome,
  `raw_payload`, mídias, URLs assinadas **nunca** vão para logs/Sentry
  (sanitização central).
- **Criptografia:** em trânsito (TLS) e em repouso; `raw_payload` cifrado.
- **Backup/Exportação:** herda a classe; exportação só por fluxo autorizado.
- **Retenção/Anonimização/Exclusão:** *Pendente de decisão antes do uso de dados
  reais* — ver §4.
- **Auditoria:** acessos administrativos e ações sob grant auditados.
- **Risco de vazamento:** alto (LGPD, dano ao titular) — controle prioritário.

### 3.2 Confidencial (negócio da clínica)
Isolado por tenant (RLS); acesso por papel; sem PII em logs; retenção conforme
necessidade operacional (*a definir*); risco: dano competitivo/contratual.

### 3.3 Segredo/credencial (tokens, segredos de webhook)
Cifrado, por conexão/ambiente; **nunca** em logs nem no bundle do cliente;
rotação documentada; acesso mínimo; risco: comprometimento amplo → rotação
imediata em incidente.

### 3.4 Segurança/auditoria (audit logs, support grants)
Append-only; acesso restrito; não editável; retenção tende a ser mais longa
(*a definir*); risco: perda de rastreabilidade.

### 3.5 Identificadores técnicos permitidos em telemetria
`clinic_id`, `event_id`, `request_id`, `provider`, `connection_id`, status,
código interno de erro — **únicos** permitidos em logs/observabilidade.

## 4. Opções de retenção (sem valores finais)

Estratégia **em camadas** proposta (valores a aprovar):
1. **Payload integral** por período curto (operacional/depuração).
2. **Minimizado ou cifrado** durante período operacional.
3. **Apenas identificadores** necessários para idempotência e auditoria.
4. **Exclusão ou anonimização** após o prazo aprovado.

| Variável | Opções a avaliar | Status |
|---|---|---|
| Retenção do `raw_payload` | curto / médio / camadas | *Pendente de decisão antes do uso de dados reais.* |
| Retenção de conteúdo de mensagem | operacional / estendida | *Pendente de decisão antes do uso de dados reais.* |
| Retenção de dados pessoais gerais | por finalidade | *Pendente de decisão antes do uso de dados reais.* |
| Anonimização/exclusão | automática por prazo | *Pendente de decisão antes do uso de dados reais.* |

## 5. LGPD (pendências bloqueantes)

Base legal por finalidade; consentimento quando aplicável; aviso de privacidade;
contratos/responsabilidades com clínicas; atendimento a acesso/correção/
portabilidade/exclusão; política de retenção; lista de subprocessadores; processo
de incidente com dados pessoais; **revisão jurídica antes da produção**. Esta
documentação técnica **não substitui** revisão jurídica.
