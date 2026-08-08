import { formatBrPhoneDigits, isPlausibleBrPhone, phoneDigits } from "@/shared/lib/phone";
import type { StatusTone } from "@/shared/ui/status-badge";

/**
 * Modelos de apresentação do CRM.
 *
 * São adaptadores de fronteira puros: traduzem as linhas devolvidas pelos
 * contratos públicos de `@/modules/crm` para o que a interface precisa
 * desenhar. Não conhecem banco, Server Action nem autorização.
 *
 * A regra que atravessa este arquivo: **ausente é diferente de vazio**.
 * `undefined` significa "o contrato de leitura não informa este campo" e vira
 * "—"; `null` significa "o contrato informou, e não há valor" e vira um texto
 * explícito. Preencher um campo ausente com um valor plausível seria inventar
 * informação.
 */

/** Marca de "não informado por esta leitura" — nunca de "não existe". */
export const UNKNOWN_FIELD_LABEL = "—";

export function optionalText(value: string | null | undefined, whenEmpty: string): string {
  if (value === undefined) return UNKNOWN_FIELD_LABEL;
  return value ?? whenEmpty;
}

// ---------------------------------------------------------------------------
// Contatos
// ---------------------------------------------------------------------------

/** Estado da listagem. `error` é falha real; `empty` é resposta legítima. */
export type CrmListState = "ready" | "loading" | "error";

/**
 * Linha da listagem de contatos.
 *
 * `search_contacts` devolve identificação, responsável, notas, arquivamento,
 * versão e criação — e só. Telefone principal, e-mail principal, origem e data
 * de atualização **não fazem parte desse contrato**, por isso não aparecem
 * aqui: a listagem exibe "—" e o detalhe traz o dado real.
 */
export type ContactRowView = {
  readonly id: string;
  readonly fullName: string;
  readonly ownerName: string | null;
  readonly createdAtLabel: string;
  readonly archived: boolean;
  readonly href: string;
};

export type ContactMethodView = {
  readonly id: string;
  readonly kind: "phone" | "email" | "other";
  readonly rawValue: string;
  readonly displayValue: string;
  readonly label: string | null;
  readonly isPrimary: boolean;
  readonly isWhatsapp: boolean;
};

/**
 * Telefone é exibido com máscara brasileira; os demais valores, como vieram.
 *
 * A máscara só é aplicada quando os dígitos formam um telefone nacional
 * plausível (10 ou 11 dígitos, com ou sem o prefixo do país). Qualquer outro
 * texto é devolvido intacto: mascarar às cegas descartaria o que não é dígito e
 * mostraria um número diferente do que está guardado.
 */
export function contactMethodDisplayValue(kind: string, rawValue: string): string {
  if (kind !== "phone") return rawValue;
  // Um prefixo internacional que não seja o do Brasil descarta a máscara: onze
  // dígitos de outro país não são um celular brasileiro.
  const trimmed = rawValue.trim();
  if (trimmed.startsWith("+") && !trimmed.startsWith("+55")) return rawValue;
  const digits = phoneDigits(rawValue);
  const national = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
  if (!isPlausibleBrPhone(national)) return rawValue;
  return formatBrPhoneDigits(national);
}

export function contactMethodKind(kind: string): ContactMethodView["kind"] {
  if (kind === "phone") return "phone";
  if (kind === "email") return "email";
  return "other";
}

export function contactMethodKindLabel(kind: ContactMethodView["kind"]): string {
  if (kind === "phone") return "Telefone";
  if (kind === "email") return "E-mail";
  return "Outro meio";
}

/** Métodos ativos, com o principal primeiro e o restante em ordem estável. */
export function sortContactMethods(
  methods: readonly ContactMethodView[],
): readonly ContactMethodView[] {
  return [...methods].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    if (left.kind !== right.kind) return left.kind.localeCompare(right.kind);
    return left.displayValue.localeCompare(right.displayValue, "pt-BR");
  });
}

/** Principal do tipo pedido, ou `null` quando o contato não tem nenhum. */
export function primaryMethod(
  methods: readonly ContactMethodView[],
  kind: ContactMethodView["kind"],
): ContactMethodView | null {
  const ofKind = methods.filter((method) => method.kind === kind);
  return ofKind.find((method) => method.isPrimary) ?? ofKind[0] ?? null;
}

// ---------------------------------------------------------------------------
// Oportunidades
// ---------------------------------------------------------------------------

export type OpportunityStatus = "open" | "won" | "lost";

export function opportunityStatus(status: string): OpportunityStatus {
  if (status === "won") return "won";
  if (status === "lost") return "lost";
  return "open";
}

export function opportunityStatusLabel(status: OpportunityStatus): string {
  if (status === "won") return "Ganha";
  if (status === "lost") return "Perdida";
  return "Aberta";
}

export function opportunityStatusTone(status: OpportunityStatus): StatusTone {
  if (status === "won") return "success";
  if (status === "lost") return "danger";
  return "accent";
}

/** Oportunidade vista a partir do contato ou do próprio detalhe. */
export type OpportunityRowView = {
  readonly id: string;
  readonly title: string;
  readonly status: OpportunityStatus;
  readonly stageName: string | null;
  readonly pipelineName: string | null;
  readonly assigneeName: string | null;
  readonly sourceName: string | null;
  readonly amountCents: number | null;
  readonly updatedAtLabel: string;
  readonly href: string;
};

/** Evento de etapa já resolvido em nomes — o histórico nunca mostra id cru. */
export type StageEventView = {
  readonly id: string;
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly occurredAtLabel: string;
  readonly reason: string | null;
};

/**
 * Rótulo de uma ponta do evento de etapa. Sem etapa de origem, o evento é a
 * criação da oportunidade; um id sem nome correspondente cai no status, que o
 * banco sempre informa.
 */
export function stageEventLabel(
  stageId: string | null,
  status: string | null,
  stageNames: ReadonlyMap<string, string>,
): string {
  if (stageId === null) return status === null ? "Criação" : opportunityStatusLabel(opportunityStatus(status));
  return stageNames.get(stageId) ?? (status === null ? "Etapa removida" : opportunityStatusLabel(opportunityStatus(status)));
}

// ---------------------------------------------------------------------------
// Escopo de leitura
// ---------------------------------------------------------------------------

/** Texto do escopo aplicado pelo servidor — a pessoa sabe o que está vendo. */
export function scopeLabel(scope: string, subject: "contatos" | "oportunidades"): string {
  return scope === "all"
    ? `Exibindo ${subject} de toda a clínica.`
    : `Exibindo somente ${subject} sob sua responsabilidade.`;
}
