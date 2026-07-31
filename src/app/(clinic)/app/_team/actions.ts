"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { inviteClinicMember, resolveActiveClinicContext } from "@/modules/tenancy";

import { crmErrorMessage } from "../_crm/crm-errors";
import { INVITE_EXPIRES_IN_HOURS, type InviteState } from "./invite-state";

/**
 * Server Actions da equipe da clínica.
 *
 * Hoje existe **uma só**: convidar. É o único fluxo de escrita de equipe com
 * contrato público na main. Alterar cargo, ativar, desativar, remover membro,
 * reenviar e cancelar convite existem como permissão no catálogo
 * (`member.manage`, `member.remove`) mas **não** como função exportada por
 * `@/modules/tenancy` — e a interface não cria botão para o que não persiste.
 *
 * ## Por que o resultado volta como estado, e não como redirecionamento
 *
 * `inviteClinicMember` **não envia e-mail**: ele cria o convite e devolve um
 * link contendo o token de aceite. Sem esse link ninguém consegue entrar — o
 * convite existiria só no banco. Então o link precisa chegar à tela.
 *
 * Ele volta no **estado da ação**, nunca em redirecionamento, nunca em query
 * string, nunca em log. Um token em URL entra no histórico do navegador, no
 * `Referer` e em qualquer proxy no caminho; no estado ele vive apenas no
 * resultado imediato daquela submissão, para a pessoa copiar e repassar.
 *
 * Demais invariantes:
 *
 * - o `clinicId` é resolvido no servidor e não existe como campo de formulário;
 * - a entrada passa por Zod `.strict()` antes de chegar ao módulo;
 * - `owner` não é convidável: o contrato recusa, e o esquema aqui também —
 *   nenhuma autoelevação passa pela borda;
 * - o contrato exige AAL2, verificado no módulo e novamente no banco;
 * - a mensagem de erro é escrita por nós; código do banco não atravessa.
 */

const TEAM_PATH = "/app/settings/team";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function failure(code: string): InviteState {
  return { message: crmErrorMessage(code), status: "error" };
}

export async function inviteMemberAction(
  _previous: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") return failure("forbidden");

  const payload = z.object({
    clinicId: z.uuid(),
    email: z.email().max(320),
    expiresInHours: z.number().int().min(1).max(24 * 30),
    // `owner` fora da lista: o servidor recusa e a borda também.
    role: z.enum(["admin", "manager", "sdr", "receptionist", "professional", "viewer"]),
  }).strict().safeParse({
    clinicId: context.clinic.id,
    email: field(formData, "email"),
    expiresInHours: INVITE_EXPIRES_IN_HOURS,
    role: field(formData, "role"),
  });
  if (!payload.success) return failure("invalid_input");

  const result = await inviteClinicMember(payload.data);
  if (!result.ok) return failure(result.code);

  revalidatePath(TEAM_PATH);
  // O link vai só para quem acabou de criar o convite. Nada dele é registrado.
  return {
    email: payload.data.email,
    expiresInHours: INVITE_EXPIRES_IN_HOURS,
    link: result.link,
    status: "created",
  };
}
