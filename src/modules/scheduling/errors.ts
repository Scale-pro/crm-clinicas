import { requireAal2, requirePermission } from "@/shared/auth";

type DatabaseError = { code?: string };

export type SchedulingErrorCode =
  | "appointment_canceled"
  | "appointment_contact_not_found"
  | "appointment_not_found"
  | "appointment_overlap"
  | "availability_overlap"
  | "forbidden"
  | "invalid_availability"
  | "invalid_input"
  | "mfa_required"
  | "professional_archived"
  | "professional_not_found"
  | "professional_procedure_conflict"
  | "professional_user_already_linked"
  | "professional_user_not_member"
  | "procedure_archived"
  | "procedure_name_conflict"
  | "procedure_not_found"
  | "stale_version"
  | "unauthenticated"
  | "unavailable";

export function mapSchedulingError(error: DatabaseError): SchedulingErrorCode {
  const codes: Record<string, SchedulingErrorCode> = {
    P4091: "stale_version",
    P4301: "professional_not_found",
    P4302: "professional_archived",
    P4303: "professional_user_already_linked",
    P4304: "professional_user_not_member",
    P4305: "procedure_not_found",
    P4306: "procedure_archived",
    P4307: "procedure_name_conflict",
    P4308: "professional_procedure_conflict",
    P4309: "availability_overlap",
    P4310: "invalid_availability",
    P4311: "appointment_not_found",
    P4312: "appointment_canceled",
    P4313: "appointment_overlap",
    P4315: "appointment_contact_not_found",
    "42501": "forbidden",
    "22023": "invalid_input",
    "23514": "invalid_input",
  };
  return error.code ? codes[error.code] ?? "unavailable" : "unavailable";
}

export async function requireSchedulingAccess(
  clinicId: string,
  permission:
    | "appointment.manage"
    | "appointment.view"
    | "professional.manage"
    | "professional.view"
    | "procedure.manage"
    | "procedure.view",
  aal2 = false,
) {
  const permitted = await requirePermission(clinicId, permission);
  if (!permitted.allowed) return { ok: false, code: permitted.code } as const;
  if (!aal2) return { ok: true, session: permitted.session } as const;
  const strongSession = await requireAal2();
  if (!strongSession.allowed) return { ok: false, code: strongSession.code } as const;
  return { ok: true, session: strongSession.session } as const;
}
