import { afterAll, describe, expect, it } from "vitest";

import {
  createTestAdminClient,
  createTestUserClient,
} from "./helpers/create-test-admin-client";

const admin = createTestAdminClient();
const userIds: string[] = [];

afterAll(async () => {
  for (const userId of userIds) {
    await admin.auth.admin.deleteUser(userId);
  }
});

describe("sessão Supabase Auth local", () => {
  it("logout global revoga o refresh token real", async () => {
    const email = `logout-${crypto.randomUUID()}@example.test`;
    const password = "Local-only-test-password-123!";
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
    });
    expect(created.error).toBeNull();
    expect(created.data.user).not.toBeNull();
    userIds.push(created.data.user!.id);

    const client = createTestUserClient();
    const signedIn = await client.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.session).not.toBeNull();
    const session = signedIn.data.session!;

    const signedOut = await client.auth.signOut({ scope: "global" });
    expect(signedOut.error).toBeNull();

    const replay = createTestUserClient();
    const refreshed = await replay.auth.refreshSession({
      refresh_token: session.refresh_token,
    });
    expect(refreshed.error).not.toBeNull();
    expect(refreshed.data.session).toBeNull();
  });
});
