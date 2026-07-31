import type { StatusTone } from "@/shared/ui/status-badge";

/**
 * Modelos de apresentação da equipe da clínica.
 *
 * Adaptadores puros sobre o que `listActiveClinicMembers` devolve:
 * `userId`, `fullName`, `avatarUrl`, `role` e `status`. **Só isso.**
 *
 * E-mail, data de entrada, último acesso, profissional vinculado e permissões
 * efetivas não fazem parte de nenhum contrato público hoje — por isso não têm
 * lugar nestes modelos. Inventá-los seria apresentar ficção como dado real.
 */

/** Cargos do catálogo real (`clinic_members.role`). */
export type ClinicRole =
  | "owner"
  | "admin"
  | "manager"
  | "sdr"
  | "receptionist"
  | "professional"
  | "viewer";

const ROLE_LABELS: Readonly<Record<string, string>> = {
  admin: "Administrador",
  manager: "Gestor",
  owner: "Proprietário",
  professional: "Profissional",
  receptionist: "Recepção",
  sdr: "Pré-vendas",
  viewer: "Somente leitura",
};

/** Cargo desconhecido não vira "Proprietário" por acidente. */
export function roleLabel(role: string): string {
  return ROLE_LABELS[role] ?? "Cargo não reconhecido";
}

export function roleTone(role: string): StatusTone {
  if (role === "owner") return "accent";
  if (role === "admin" || role === "manager") return "success";
  return "neutral";
}

/**
 * Cargos que o convite aceita, na ordem em que fazem sentido para quem escolhe.
 *
 * `owner` está deliberadamente fora: o contrato de convite recusa esse papel, e
 * a lista espelha isso em vez de oferecer uma opção que o servidor rejeitaria.
 */
export const INVITABLE_ROLES: readonly { readonly value: ClinicRole; readonly label: string }[] = [
  { label: ROLE_LABELS.admin!, value: "admin" },
  { label: ROLE_LABELS.manager!, value: "manager" },
  { label: ROLE_LABELS.sdr!, value: "sdr" },
  { label: ROLE_LABELS.receptionist!, value: "receptionist" },
  { label: ROLE_LABELS.professional!, value: "professional" },
  { label: ROLE_LABELS.viewer!, value: "viewer" },
];

export type MemberRowView = {
  readonly userId: string;
  readonly fullName: string;
  readonly role: string;
  readonly isCurrentUser: boolean;
};

/** Iniciais para o avatar textual — nunca substitui o nome, só o acompanha. */
export function memberInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]![0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? "" : "";
  return `${first}${last}`.toLocaleUpperCase("pt-BR");
}

/**
 * Proprietários ativos entre os membros carregados.
 *
 * Serve para explicar na tela por que a saída do último proprietário é
 * bloqueada — a proteção real é do banco, esta contagem é só o texto.
 */
export function ownerCount(members: readonly MemberRowView[]): number {
  return members.filter((member) => member.role === "owner").length;
}

/** `true` quando remover ou rebaixar este membro deixaria a clínica sem dono. */
export function isLastOwner(
  member: MemberRowView,
  members: readonly MemberRowView[],
): boolean {
  return member.role === "owner" && ownerCount(members) <= 1;
}
