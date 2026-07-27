import { NextResponse } from "next/server";

import {
  ACTIVE_CLINIC_COOKIE_NAME,
  activeClinicCookieOptions,
  signOutCurrentSession,
} from "@/shared/auth";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ message: "Requisição não autorizada." }, { status: 403 });
  }

  if (!(await signOutCurrentSession())) {
    return NextResponse.json(
      { message: "Não foi possível encerrar a sessão." },
      { status: 503 },
    );
  }

  const response = NextResponse.redirect(
    new URL("/login?reason=signed_out", request.url),
    303,
  );
  response.cookies.set(ACTIVE_CLINIC_COOKIE_NAME, "", {
    ...activeClinicCookieOptions(),
    maxAge: 0,
  });
  return response;
}
