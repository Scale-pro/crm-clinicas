import "server-only";

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/shared/config";
import type { Database } from "@/shared/db";

import { safeInternalRedirect } from "./safe-redirect";

const PROTECTED_PREFIXES = ["/app", "/platform"];

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  for (const cookie of source.cookies.getAll()) {
    target.cookies.set(cookie);
  }
}

export async function refreshAuthSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    serverEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  let authenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    authenticated = error === null && Boolean(data?.claims.sub);
  } catch {
    authenticated = false;
  }

  if (!authenticated && isProtectedPath(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("reason", "session_expired");
    loginUrl.searchParams.set(
      "next",
      safeInternalRedirect(
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
        "/",
      ),
    );
    const redirect = NextResponse.redirect(loginUrl);
    copyResponseCookies(response, redirect);
    return redirect;
  }

  return response;
}
