import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function filesUnder(relativeDirectory: string): string[] {
  return readdirSync(path.join(root, relativeDirectory), { withFileTypes: true }).flatMap(
    (entry) => {
      const relative = path.join(relativeDirectory, entry.name);
      return entry.isDirectory() ? filesUnder(relative) : [relative];
    },
  );
}

describe("rotas e fronteiras de contatos F2.1", () => {
  it("cria somente as quatro páginas aprovadas dentro de contacts", () => {
    const pages = filesUnder("src/app/(clinic)/app/contacts")
      .filter((file) => file.endsWith("page.tsx"))
      .sort();
    expect(pages).toEqual([
      "src/app/(clinic)/app/contacts/[contactId]/edit/page.tsx",
      "src/app/(clinic)/app/contacts/[contactId]/page.tsx",
      "src/app/(clinic)/app/contacts/new/page.tsx",
      "src/app/(clinic)/app/contacts/page.tsx",
    ]);
  });

  it("server actions validam contexto, usam API pública e não fazem mass assignment", () => {
    const actions = read("src/app/(clinic)/app/contacts/actions.ts");
    expect(actions).toContain('"use server"');
    expect(actions).toContain("resolveActiveClinicContext()");
    expect(actions).toContain('field(formData, "clinicId") !== context.clinic.id');
    expect(actions).toContain('from "@/modules/crm"');
    expect(actions).not.toMatch(/@\/modules\/crm\//);
    expect(actions).not.toMatch(/insert\(formData|update\(formData/);
    expect(actions).not.toContain("console.");
  });

  it("mantém estados de erro, vazio, pending e conflito identificável", () => {
    expect(read("src/app/(clinic)/app/contacts/page.tsx")).toContain("<EmptyState");
    expect(read("src/app/(clinic)/app/contacts/page.tsx")).toContain("<ErrorState");
    expect(read("src/app/(clinic)/app/contacts/new/contact-form.tsx")).toContain("pending");
    expect(read("src/app/(clinic)/app/contacts/[contactId]/edit/page.tsx")).toContain(
      "Este contato foi alterado em outra sessão",
    );
  });

  it("não cria superfície de fases futuras", () => {
    const files = filesUnder("src/app/(clinic)/app").join("\n");
    expect(files).not.toMatch(/opportunities|pipeline|kanban|appointments|conversations|whatsapp|finance/i);
  });
});
