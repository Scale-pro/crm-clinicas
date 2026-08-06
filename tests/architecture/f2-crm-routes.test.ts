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

/** Concatena todos os arquivos de uma rota (página + componentes próximos). */
function readTree(relativeDirectory: string): string {
  return filesUnder(relativeDirectory).map(read).join("\n");
}

describe("rotas e fronteiras de CRM F2.2", () => {
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
    // A agenda e o financeiro derivado dela chegaram na F4, com backend próprio.
    // O WhatsApp chegou na F2/WhatsApp — a conversa vive dentro do pipeline, e
    // uma caixa de entrada dedicada (`conversations`) continua sendo fase futura.
    expect(files).not.toMatch(/tasks|conversations|messages/i);
  });

  it("cria somente o Kanban e a ficha de oportunidade aprovados", () => {
    expect(filesUnder("src/app/(clinic)/app/pipeline")).toContain(
      "src/app/(clinic)/app/pipeline/page.tsx",
    );
    expect(filesUnder("src/app/(clinic)/app/opportunities")).toEqual([
      "src/app/(clinic)/app/opportunities/[opportunityId]/page.tsx",
    ]);
  });

  it("move cards por controle acessível e pela mesma Server Action", () => {
    const board = readTree("src/app/(clinic)/app/pipeline");
    expect(board).toContain("Mover para etapa");
    expect(board).toContain("<select");
    expect(board).toContain("moveOpportunityFormAction");
    expect(board).not.toContain("onDragEnd");
  });

  it("pagina o board e pesquisa contatos antigos no servidor", () => {
    const board = readTree("src/app/(clinic)/app/pipeline");
    expect(board).toContain('name="contactQ"');
    expect(board).toContain("Pesquisar contato");
    expect(board).toContain("paginationHref");
    expect(board).toContain("board.hasMore");
    expect(board).toContain("<PaginationBar");
    expect(read("src/app/(clinic)/app/_components/pagination-bar.tsx")).toContain("Página {page}");
    expect(board).not.toContain("limit: 100, search: \"\"");
  });

  it("actions validam contexto e payload strict antes da API pública", () => {
    const actions = read("src/app/(clinic)/app/pipeline/actions.ts");
    expect(actions).toContain('"use server"');
    expect(actions).toContain("resolveActiveClinicContext()");
    expect(actions).toContain(".strict().safeParse");
    expect(actions).toContain('from "@/modules/crm"');
    expect(actions).not.toMatch(/@\/modules\/crm\//);
    expect(actions).not.toContain("console.");
  });
});
