"use server";

import { redirect } from "next/navigation";

import {
  createReadOnlySupportGrant,
  revokeReadOnlySupportGrant,
} from "@/modules/platform-admin";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function detailPath(clinicId: string, query?: URLSearchParams): string {
  const encodedClinicId = encodeURIComponent(clinicId);
  return `/platform/clinics/${encodedClinicId}${query ? `?${query}` : ""}`;
}

export async function createSupportGrantFormAction(formData: FormData) {
  const clinicId = field(formData, "clinicId");
  const result = await createReadOnlySupportGrant({
    accessLevel: "read_only",
    clinicId,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    reason: field(formData, "reason"),
  });
  if (!result.ok) {
    if (result.code === "unauthenticated") {
      redirect(`/login?next=${encodeURIComponent(detailPath(clinicId))}`);
    }
    if (result.code === "mfa_required") {
      redirect(`/mfa?next=${encodeURIComponent(detailPath(clinicId))}`);
    }
    const query = new URLSearchParams({ error: "grant_unavailable" });
    redirect(detailPath(clinicId, query));
  }
  const query = new URLSearchParams({ grantId: result.grantId });
  redirect(detailPath(clinicId, query));
}

export async function revokeSupportGrantFormAction(formData: FormData) {
  const clinicId = field(formData, "clinicId");
  const result = await revokeReadOnlySupportGrant(field(formData, "grantId"));
  if (!result.ok) {
    if (result.code === "unauthenticated") {
      redirect(`/login?next=${encodeURIComponent(detailPath(clinicId))}`);
    }
    if (result.code === "mfa_required") {
      redirect(`/mfa?next=${encodeURIComponent(detailPath(clinicId))}`);
    }
    const query = new URLSearchParams({ error: "revoke_unavailable" });
    redirect(detailPath(clinicId, query));
  }
  const query = new URLSearchParams({ status: "grant_revoked" });
  redirect(detailPath(clinicId, query));
}
