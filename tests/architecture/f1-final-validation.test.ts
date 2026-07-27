import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

function filesUnder(relativeDirectory: string): string[] {
  const directory = path.join(root, relativeDirectory);
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  });
}

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

describe("validação final estática da F1", () => {
  it("mantém service role e segredos administrativos fora da aplicação", () => {
    const application = filesUnder("src")
      .filter((file) => /\.(?:ts|tsx)$/.test(file))
      .map(source)
      .join("\n");

    expect(application).not.toMatch(/service[_-]?role/i);
    expect(application).not.toMatch(/supabase_(?:service|secret)[_-]?(?:role_?)?key/i);
    expect(application).not.toMatch(/createServiceRoleClient/);
  });

  it("não usa getSession, localStorage ou estado cliente como autorização", () => {
    const protectedSources = [
      ...filesUnder("src/app/(clinic)"),
      ...filesUnder("src/shared/auth"),
    ]
      .filter((file) => /\.(?:ts|tsx)$/.test(file) && !file.endsWith(".test.ts"))
      .map(source)
      .join("\n");

    expect(protectedSources).not.toContain("getSession(");
    expect(protectedSources).not.toContain("localStorage");
    expect(protectedSources).toContain("getClaims(");
  });

  it("mantém todas as Actions pinadas por SHA completo", () => {
    const workflows = filesUnder(".github/workflows")
      .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
      .flatMap((file) => source(file).split("\n"));
    const actions = workflows
      .map((line) => line.match(/^\s*-?\s*uses:\s*([^\s#]+)/)?.[1])
      .filter((value): value is string => Boolean(value));

    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(action).toMatch(/^[^@]+@[0-9a-f]{40}$/);
  });

  it("não tolera falha em jobs críticos nem pula testes", () => {
    const ci = source(".github/workflows/ci.yml");
    for (const [job, nextJob] of [
      ["quality", "dependency-audit"],
      ["dependency-audit", "dependency-audit-informational"],
      ["gitleaks", "database-auth"],
      ["database-auth", undefined],
    ] as const) {
      const start = ci.indexOf(`  ${job}:`);
      const end = nextJob ? ci.indexOf(`  ${nextJob}:`, start) : ci.length;
      expect(ci.slice(start, end)).not.toContain("continue-on-error");
    }

    const tests = filesUnder("tests")
      .filter((file) => file.endsWith(".test.ts"))
      .map(source)
      .join("\n");
    expect(tests).not.toMatch(/\b(?:describe|it|test)\.skip\s*\(/);
  });

  it("mantém a navegação restrita a rotas existentes da F1", () => {
    const layout = source("src/app/(clinic)/app/layout.tsx");
    const routes = [
      ["/app", "src/app/(clinic)/app/page.tsx"],
      ["/app/settings", "src/app/(clinic)/app/settings/page.tsx"],
      ["/app/team", "src/app/(clinic)/app/team/page.tsx"],
      ["/app/security", "src/app/(clinic)/app/security/page.tsx"],
      ["/app/account", "src/app/(clinic)/app/account/page.tsx"],
    ] as const;
    for (const [route, file] of routes) {
      expect(layout).toContain(`"${route}"`);
      expect(filesUnder("src/app")).toContain(file);
    }
    expect(layout).not.toMatch(/contacts|patients|opportunities|pipeline|kanban|appointments|whatsapp|finance/i);
  });

  it("preserva labels, foco visível e responsividade mínima do shell", () => {
    const formFiles = [
      "src/app/(auth)/login/page.tsx",
      "src/app/(auth)/register/page.tsx",
      "src/app/(auth)/forgot-password/page.tsx",
      "src/app/(auth)/reset-password/page.tsx",
      "src/app/(auth)/onboarding/page.tsx",
      "src/app/(auth)/mfa/mfa-form.tsx",
      "src/app/(clinic)/app/account/page.tsx",
      "src/app/(clinic)/app/settings/page.tsx",
      "src/app/(clinic)/app/team/invite-member-form.tsx",
      "src/shared/ui/clinic-selector.tsx",
    ];
    for (const file of formFiles) {
      const contents = source(file);
      const controls = (contents.match(/<(?:Input|select)\b/g) ?? []).length;
      const labels = (contents.match(/<label\b/g) ?? []).length;
      expect(labels, file).toBeGreaterThanOrEqual(controls);
    }

    const button = source("src/shared/ui/button.tsx");
    const input = source("src/shared/ui/input.tsx");
    const layout = source("src/app/(clinic)/app/layout.tsx");
    expect(button).toContain("focus-visible:");
    expect(input).toContain("focus-visible:");
    expect(layout).toContain("focus-visible:");
    expect(layout).toMatch(/sm:/);
    expect(layout).toMatch(/lg:/);
  });
});
