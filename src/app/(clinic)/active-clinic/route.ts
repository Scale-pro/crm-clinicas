import { NextResponse } from "next/server";

import { safeInternalRedirect, selectActiveClinic } from "@/shared/auth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeInternalRedirect(url.searchParams.get("next"), "/app");
  const result = await selectActiveClinic({
    clinicId: url.searchParams.get("clinicId"),
    next,
  });
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/select-clinic?error=${result.code}`, url), 303);
  }
  return NextResponse.redirect(new URL(result.redirectTo, url), 303);
}
