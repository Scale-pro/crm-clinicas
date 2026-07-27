import { beforeEach, describe, expect, it, vi } from "vitest";

const { signOutCurrentSession } = vi.hoisted(() => ({
  signOutCurrentSession: vi.fn(),
}));

vi.mock("@/shared/auth", () => ({
  ACTIVE_CLINIC_COOKIE_NAME: "crm_active_clinic",
  activeClinicCookieOptions: () => ({
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: false,
  }),
  signOutCurrentSession,
}));

import { POST } from "./route";

describe("logout HTTP", () => {
  beforeEach(() => signOutCurrentSession.mockReset());

  it("revoga a sessão, expira o cookie de clínica e redireciona", async () => {
    signOutCurrentSession.mockResolvedValue(true);
    const response = await POST(new Request("http://localhost:3000/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }));

    expect(signOutCurrentSession).toHaveBeenCalledOnce();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login?reason=signed_out");
    expect(response.headers.get("set-cookie")).toContain("crm_active_clinic=");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("não redireciona quando a revogação global falha", async () => {
    signOutCurrentSession.mockResolvedValue(false);
    const response = await POST(new Request("http://localhost:3000/auth/logout", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    }));
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("recusa POST cross-origin", async () => {
    const response = await POST(new Request("http://localhost:3000/auth/logout", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    }));
    expect(response.status).toBe(403);
    expect(signOutCurrentSession).not.toHaveBeenCalled();
  });
});
