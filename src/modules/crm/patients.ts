import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/shared/db";

import { mapCrmError, requireContactEditAccess } from "./contacts";

const patientSchema = z.object({ clinicId: z.uuid(), contactId: z.uuid() }).strict();

async function changePatientLink(input: unknown, link: boolean) {
  const parsed = patientSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireContactEditAccess(parsed.data.clinicId, parsed.data.contactId);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = link
    ? await supabase.rpc("link_contact_as_patient", {
        clinic_id: parsed.data.clinicId,
        contact_id: parsed.data.contactId,
      })
    : await supabase.rpc("unlink_contact_as_patient", {
        clinic_id: parsed.data.clinicId,
        contact_id: parsed.data.contactId,
      });
  if (result.error) return { ok: false, code: mapCrmError(result.error) } as const;
  return { ok: true } as const;
}

export const linkContactAsPatient = (input: unknown) => changePatientLink(input, true);
export const unlinkContactAsPatient = (input: unknown) => changePatientLink(input, false);
