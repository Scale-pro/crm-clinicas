import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const migration = readFileSync(
  path.join(root, "supabase/migrations/20260725200000_f1_invitations_and_members.sql"),
  "utf8",
).toLowerCase();
const app = readFileSync(
  path.join(root, "src/shared/auth/invitations.ts"),
  "utf8",
);

describe("convites e membros", () => {
  it("token tem 32 bytes, hash SHA-256 e somente o hash chega à RPC", () => {
    expect(app).toContain("randomBytes(32)");
    expect(app).toContain('createHash("sha256")');
    expect(app).toContain("token_hash: tokenHash");
    expect(migration).toContain("token_hash !~ '^[a-f0-9]{64}$'");
    expect(migration).not.toContain("raw_token");
  });

  it("todas as mutações administrativas exigem AAL2", () => {
    for (const routine of [
      "invite_member",
      "revoke_invitation",
      "update_member_role",
      "suspend_member",
      "remove_member",
    ]) {
      const body = migration.slice(migration.indexOf(`create function public.${routine}`));
      expect(body.indexOf("app_private.require_aal2()")).toBeGreaterThan(-1);
    }
  });

  it("aceite deriva usuário, e-mail e papel exclusivamente no banco", () => {
    const body = migration.slice(
      migration.indexOf("create function public.accept_invitation"),
      migration.indexOf("create function public.revoke_invitation"),
    );
    expect(body).toContain("auth.uid()");
    expect(body).toContain("email_confirmed_at");
    expect(body).toContain("v_invitation.role");
    expect(body).not.toMatch(/accept_invitation\([^)]*(email|role|user_id)/);
  });

  it("operações de owner usam lock e recusam owner zero", () => {
    expect(migration).toContain("for update");
    expect(migration.match(/message = 'active owner required'/g)).toHaveLength(3);
  });
});
