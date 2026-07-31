"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { inviteClinicMember, resolveActiveClinicContext } from "@/modules/tenancy";

/**
 * Server Actions da equipe da clínica.
 *
 * Hoje existe **uma só**: convidar. É o único fluxo de escrita de equipe com
 * contrato público na main. Alterar cargo, ativar, desativar, remover membro,
 * reenviar e cancelar convite existem como permissão no catálogo
 * (`member.manage`, `member.remove`) mas **não** como função exportada por
 * `@/modules/tenancy` — e a interface não cria botão para o que não persiste.
 *
 * Invariantes:
 *
 * - o `clinicId` é resolvido no servidor e não existe como campo de formulário;
 * - a entrada passa por Zod `.strict()` antes de chegar ao módulo;
 * - `owner` não é um cargo convidável: o contrato recusa, e o esquema aqui
 *   também — nenhuma autoelevação passa pela borda;
 * - o contrato exige AAL2, verificado no módulo e novamente no banco;
 * - o link do convite é devolvido pelo módulo e **não** é registrado em log.
 */

const TEAM_PATH = "/app/settings/team";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function back(key: "error" | "status", code: string): never {
  redirect(`${TEAM_PATH}?${key}=${encodeURIComponent(code)}`);
}

export async function inviteMemberAction(formData: FormData) {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") back("error", "forbidden");

  const payload = z.object({
    clinicId: z.uuid(),
    email: z.email().max(320),
    expiresInHours: z.number().int().min(1).max(24 * 30),
    // `owner` fora da lista: o servidor recusa e a borda também.
    role: z.enum(["admin", "manager", "sdr", "receptionist", "professional", "viewer"]),
  }).strict().safeParse({
    clinicId: context.clinic.id,
    email: field(formData, "email"),
    expiresInHours: 72,
    role: field(formData, "role"),
  });
  if (!payload.success) back("error", "invalid_input");

  const result = await inviteClinicMember(payload.data);
  if (!result.ok) back("error", result.code);
  revalidatePath(TEAM_PATH);
  back("status", "member_invited");
}
