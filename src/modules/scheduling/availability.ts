import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/shared/db";

import { mapSchedulingError, requireSchedulingAccess } from "./errors";

export const weeklyAvailabilityIntervalSchema = z.object({
  weekday: z.number().int().min(1).max(7),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
}).strict().refine((value) => value.startMinute < value.endMinute, {
  message: "O início deve ser anterior ao fim.",
});

export const setProfessionalWeeklyAvailabilitySchema = z.object({
  clinicId: z.uuid(),
  professionalId: z.uuid(),
  intervals: z.array(weeklyAvailabilityIntervalSchema).max(100),
}).strict().superRefine((value, context) => {
  const sorted = sortWeeklyAvailability(value.intervals);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (previous.weekday === current.weekday && current.startMinute < previous.endMinute) {
      context.addIssue({ code: "custom", path: ["intervals", index], message: "Intervalos sobrepostos." });
    }
  }
});

export const getProfessionalWeeklyAvailabilitySchema = z.object({
  clinicId: z.uuid(),
  professionalId: z.uuid(),
}).strict();

export function sortWeeklyAvailability<T extends {
  weekday: number;
  startMinute: number;
  endMinute: number;
}>(intervals: readonly T[]): T[] {
  return [...intervals].sort((left, right) =>
    left.weekday - right.weekday || left.startMinute - right.startMinute || left.endMinute - right.endMinute);
}

export async function getProfessionalWeeklyAvailability(input: unknown) {
  const parsed = getProfessionalWeeklyAvailabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "professional.view");
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const [result, clinic] = await Promise.all([
    supabase.from("professional_weekly_availability")
      .select("id,weekday,start_minute,end_minute,created_at,updated_at")
      .eq("clinic_id", parsed.data.clinicId).eq("professional_id", parsed.data.professionalId)
      .order("weekday").order("start_minute").order("end_minute"),
    supabase.from("clinics").select("timezone").eq("id", parsed.data.clinicId).maybeSingle(),
  ]);
  if (result.error || clinic.error || !clinic.data) {
    return { ok: false, code: "unavailable" } as const;
  }
  return {
    ok: true,
    timezone: clinic.data.timezone,
    intervals: result.data.map((interval) => ({
      id: interval.id,
      weekday: interval.weekday,
      startMinute: interval.start_minute,
      endMinute: interval.end_minute,
      createdAt: interval.created_at,
      updatedAt: interval.updated_at,
    })),
  } as const;
}

export async function setProfessionalWeeklyAvailability(input: unknown) {
  const parsed = setProfessionalWeeklyAvailabilitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;
  const access = await requireSchedulingAccess(parsed.data.clinicId, "professional.manage", true);
  if (!access.ok) return access;
  const supabase = await createServerSupabaseClient();
  const result = await supabase.rpc("set_professional_weekly_availability", {
    clinic_id: parsed.data.clinicId,
    professional_id: parsed.data.professionalId,
    availability: sortWeeklyAvailability(parsed.data.intervals).map((interval) => ({
      weekday: interval.weekday,
      start_minute: interval.startMinute,
      end_minute: interval.endMinute,
    })),
  });
  if (result.error) return { ok: false, code: mapSchedulingError(result.error) } as const;
  return { ok: true } as const;
}
