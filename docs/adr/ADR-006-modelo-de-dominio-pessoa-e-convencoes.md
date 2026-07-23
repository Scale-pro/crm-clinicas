# ADR-006: Modelo de domínio de pessoas e convenções de dados

- **Status:** Aceito
- **Data:** 2026-07-23
- **Fase relacionada:** F2 (pessoa/pipeline); F4 (agenda/timezone)
- **Documentos relacionados:** [data-model](../architecture/data-model.md) *(Commit 2)*

## Contexto

CRMs de clínica costumam duplicar a mesma pessoa como "lead", "contato" e
"paciente". Precisamos de um modelo que impeça duplicidade, suporte recorrência
(paciente volta para novo procedimento) e padronize convenções de dados sensíveis
à agenda (timezone) e à localização (moeda, telefone).

## Decisão

### Modelo de pessoa

1. **Uma pessoa = um `contact`** por clínica. É o único registro-pessoa e o único
   lugar que guarda dado pessoal (nome, telefone, e-mail).
2. **`lead` não é uma tabela-pessoa.** É um **estado** do contato
   (`lifecycle_stage`) combinado com uma `opportunity` em etapa inicial.
3. **`patient` é uma extensão 1:1 de `contact`** (`contact_id` único), criada
   quando a pessoa vira paciente. **Nunca se copia dado pessoal** — transformar
   lead em paciente é criar a linha em `patients` e avançar o `lifecycle_stage`.
4. Um `contact` pode ter **múltiplas `opportunities`** ao longo do tempo;
   recorrência = nova oportunidade sobre o mesmo contato.
5. **Deduplicação por tenant:** unique parcial `(clinic_id, phone_normalized)` e
   `(clinic_id, email_normalized)` — o mesmo número existe em clínicas
   diferentes, mas não duplica dentro da mesma. Fluxo find-or-create no servidor;
   a unique é a rede final contra corrida.
6. **Histórico imutável:** `activities` (timeline de negócio) e `audit_logs`
   (auditoria técnica) são **append-only** (sem UPDATE/DELETE).
7. **Soft delete** (`deleted_at`) em tabelas mutáveis de negócio; nunca em
   append-only. Campos de auditoria (`created_at/updated_at/created_by/updated_by`)
   em todas as tabelas.

### Convenções de dados (localização e agenda)

8. **Telefone:** normalização **E.164** no domínio (`phone_normalized`);
   formatação amigável apenas na interface.
9. **Timezone:** cada clínica tem um **timezone obrigatório (IANA)**. Padrão
   inicial `America/Sao_Paulo`, **nunca fixado globalmente no código**. Datas
   armazenadas em **UTC**; exibidas no timezone da clínica. O frontend **não**
   define sozinho o horário oficial do agendamento. Horário de verão/mudanças
   regionais tratados por timezone IANA, não por offset fixo.
10. **Locale/moeda:** locale inicial `pt-BR`, moeda inicial `BRL`, com formatação
    **centralizada** (nunca espalhada). Preços em orçamento guardam **snapshot**
    do valor no momento.

## Consequências

- **Positivas:** zero duplicidade por construção; recorrência e LTV
  rastreáveis; agenda correta em qualquer fuso.
- **Negativas / custos:** exige normalização/timezone centralizados e disciplina
  de find-or-create.
- **Impacto em testes:** teste de deduplicação por tenant; teste de conversão
  lead→paciente sem cópia; testes de conversão UTC↔timezone da clínica.

## Alternativas consideradas

- **`patients`/`leads` como cadastros independentes:** rejeitada — fonte de
  duplicidade.
- **Offset fixo de fuso:** rejeitada — quebra em horário de verão.

## Como alterar esta decisão

Novo ADR aprovado.
