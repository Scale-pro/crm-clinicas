import { describe, expect, it } from "vitest";

import { safeInternalRedirect } from "./safe-redirect";

describe("redirect interno seguro", () => {
  it("preserva somente caminho interno com query e fragmento", () => {
    expect(safeInternalRedirect("/app/team?tab=active#members")).toBe(
      "/app/team?tab=active#members",
    );
  });

  it.each([
    "https://evil.example/path",
    "http://evil.example/path",
    "//evil.example/path",
    "///evil.example/path",
    "/\\evil.example/path",
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "%68%74%74%70%73%3A%2F%2Fevil.example",
    "%2F%2Fevil.example/path",
    "%252F%252Fevil.example/path",
    "/%5Cevil.example/path",
  ])("recusa destino externo ou perigoso: %s", (candidate) => {
    expect(safeInternalRedirect(candidate, "/login")).toBe("/login");
  });

  it("usa fallback para encoding inválido e caracteres de controle", () => {
    expect(safeInternalRedirect("/%E0%A4%A", "/login")).toBe("/login");
    expect(safeInternalRedirect("/app\nLocation: https://evil.example", "/login")).toBe(
      "/login",
    );
  });
});
