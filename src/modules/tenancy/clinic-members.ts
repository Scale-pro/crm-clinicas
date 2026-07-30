import "server-only";

import { z } from "zod";

import { requireClinicAccess } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

const FALLBACK_MEMBER_NAME = "Membro da clínica";

export const listActiveClinicMembersSchema = z.object({
  clinicId: z.uuid(),
  search: z.string().trim().max(160).default(""),
  page: z.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
}).strict();

function normalizedText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR");
}

export async function listActiveClinicMembers(input: unknown) {
  const parsed = listActiveClinicMembersSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "invalid_input" } as const;

  try {
    const access = await requireClinicAccess(parsed.data.clinicId);
    if (!access.allowed) return { ok: false, code: access.code } as const;

    const supabase = await createServerSupabaseClient();
    const members = await supabase
      .from("clinic_members")
      .select("user_id,role,status")
      .eq("clinic_id", parsed.data.clinicId)
      .eq("status", "active")
      .order("user_id");
    if (members.error) return { ok: false, code: "unavailable" } as const;

    const userIds = members.data.map((member) => member.user_id);
    const profiles = userIds.length
      ? await supabase
        .from("profiles")
        .select("user_id,full_name,avatar_url")
        .in("user_id", userIds)
      : { data: [], error: null };
    if (profiles.error) return { ok: false, code: "unavailable" } as const;

    const profilesByUserId = new Map(
      profiles.data.map((profile) => [profile.user_id, profile]),
    );
    const search = normalizedText(parsed.data.search);
    const matched = members.data
      .map((member) => {
        const profile = profilesByUserId.get(member.user_id);
        const fullName = profile?.full_name?.trim() || FALLBACK_MEMBER_NAME;
        return {
          userId: member.user_id,
          fullName,
          avatarUrl: profile?.avatar_url ?? null,
          role: member.role,
          status: "active" as const,
          normalizedName: normalizedText(fullName),
        };
      })
      .filter((member) => member.normalizedName.includes(search))
      .sort((left, right) => {
        if (left.normalizedName < right.normalizedName) return -1;
        if (left.normalizedName > right.normalizedName) return 1;
        return left.userId.localeCompare(right.userId);
      });

    const offset = (parsed.data.page - 1) * parsed.data.pageSize;
    const items = matched
      .slice(offset, offset + parsed.data.pageSize)
      .map((member) => ({
        userId: member.userId,
        fullName: member.fullName,
        avatarUrl: member.avatarUrl,
        role: member.role,
        status: member.status,
      }));

    return {
      ok: true,
      items,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      total: matched.length,
      hasMore: offset + items.length < matched.length,
    } as const;
  } catch {
    return { ok: false, code: "unavailable" } as const;
  }
}
