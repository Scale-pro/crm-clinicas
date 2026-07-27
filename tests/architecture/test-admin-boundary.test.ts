import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: process.cwd() });

describe("fronteira do cliente administrativo de testes", () => {
  it("impede src/ de importar o helper administrativo", async () => {
    const [result] = await eslint.lintText(
      'import { createTestAdminClient } from "../../tests/integration/helpers/create-test-admin-client";\nvoid createTestAdminClient;\n',
      { filePath: "src/app/fixture-test-admin.ts" },
    );

    expect(
      result?.messages.some((message) => message.ruleId === "no-restricted-imports"),
    ).toBe(true);
  }, 30_000);

  it("não existe factory de service role em src/", async () => {
    const [result] = await eslint.lintText(
      "export function createServiceRoleClient() { return null; }\n",
      { filePath: "src/shared/db/fixture-service-role.ts" },
    );

    expect(result?.messages.some((message) => message.ruleId === "no-restricted-syntax"))
      .toBe(true);
  });
});
