import { describe, expect, it } from "vitest";

import { createTestAdminClient } from "./helpers/create-test-admin-client";

describe("fundação Supabase local", () => {
  it("usa exclusivamente uma API em loopback", () => {
    const url = new URL(process.env.API_URL ?? "");
    expect(["127.0.0.1", "localhost"]).toContain(url.hostname);
  });

  it("o helper administrativo alcança somente o Auth local", async () => {
    const admin = createTestAdminClient();
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(error).toBeNull();
  });

  it("registra se a chave pública local é publishable ou anon", () => {
    expect(["publishable", "anon"]).toContain(process.env.PUBLIC_KEY_KIND);
  });
});
