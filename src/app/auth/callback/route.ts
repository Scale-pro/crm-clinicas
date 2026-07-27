import { NextResponse } from "next/server";

import { safeInternalRedirect } from "@/shared/auth";
import { createServerSupabaseClient } from "@/shared/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeInternalRedirect(
    url.searchParams.get("next"),
    "/reset-password",
  );

  if (!code) {
    return NextResponse.redirect(new URL("/login?reason=invalid_link", url), 303);
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/login?reason=invalid_link", url), 303);
  }

  return NextResponse.redirect(new URL(next, url), 303);
}
