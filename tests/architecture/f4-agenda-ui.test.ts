import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function filesUnder(relative: string): string[] {
  const base = path.join(root, relative);
  const walk = (directory: string): string[] => readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    return statSync(full).isDirectory() ? walk(full) : [path.relative(root, full)];
  });
  return walk(base).sort();
}

/**
 * Só o código, sem comentários. As proibições abaixo falam do que o programa
 * faz; a documentação precisa poder citar `service_role` ou `SQLSTATE` para
 * explicar justamente por que eles não aparecem.
 */
function codeOf(file: string): string {
  return read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join("\n");
}

const agendaDirectory = "src/app/(clinic)/app/_agenda";
const agendaFiles = filesUnder(agendaDirectory);
const agendaTree = agendaFiles.map(codeOf).join("\n");
const routes = [
  "src/app/(clinic)/app/today/page.tsx",
  "src/app/(clinic)/app/agenda/page.tsx",
  "src/app/(clinic)/app/financeiro/page.tsx",
].map((file) => ({ file, source: read(file) }));

describe("telas de agenda F4 — fronteiras", () => {
  it("resolve tenant e fuso no servidor, nunca na URL ou no navegador", () => {
    for (const route of routes) {
      expect(route.source).toContain("resolveActiveClinicContext()");
      expect(route.source).toContain("context.clinic.timezone");
      // A clínica nunca vem de parâmetro de rota nem de query string.
      expect(route.source).not.toMatch(/clinicId["']?\s*[:=]\s*(?:params|searchParams)/);
    }
    const actions = read(`${agendaDirectory}/actions.ts`);
    expect(actions).toContain("resolveActiveClinicContext()");
    expect(actions).not.toMatch(/clinicId:\s*z\.uuid\(\)/);
  });

  it("converte horário local em instante UTC no servidor", () => {
    const actions = read(`${agendaDirectory}/actions.ts`);
    expect(actions).toContain("zonedTimeToInstant(");
    expect(actions).toContain("clinic.timezone");
    // O cliente envia dia civil + HH:MM; quem decide o instante é o servidor.
    const dialog = read(`${agendaDirectory}/new-appointment-dialog.tsx`);
    expect(dialog).not.toContain("toISOString()");
    expect(dialog).not.toContain("getTimezoneOffset");
  });

  it("fala com o domínio só pela interface pública dos módulos", () => {
    expect(agendaTree).not.toMatch(/@\/modules\/[a-z-]+\//);
    expect(agendaTree).not.toContain("@supabase/");
    expect(agendaTree).not.toContain("createServerSupabaseClient");
    expect(agendaTree).not.toContain("service_role");
    expect(agendaTree).not.toContain("SERVICE_ROLE");
    expect(agendaTree).not.toMatch(/\bconsole\./);
    // Nenhum SQL vive na camada de tela.
    expect(agendaTree).not.toMatch(/create\s+(?:table|policy|function|index)\b/i);
  });

  it("converge a criação de pessoas no caso de uso único do CRM", () => {
    const actions = read(`${agendaDirectory}/actions.ts`);
    expect(actions).toContain('from "@/modules/crm"');
    expect(actions).toContain("createContact(");
    // A tela não fala com tabela de contatos por conta própria.
    expect(agendaTree).not.toMatch(/from\(["']contacts["']\)/);
  });

  it("mantém idempotência e concorrência otimista nas escritas", () => {
    const actions = read(`${agendaDirectory}/actions.ts`);
    expect(actions).toContain("randomUUID()");
    expect(actions).toContain("idempotencyKey");
    expect(actions).toContain("expectedVersion");
    expect(actions).toContain("revalidatePath");
  });

  it("não deixa mensagem do banco atravessar para a interface", () => {
    const actions = codeOf(`${agendaDirectory}/actions.ts`);
    expect(actions).toContain("schedulingErrorMessage(");
    expect(actions).not.toMatch(/error\.message|result\.error|sqlstate/i);
  });

  it("trata permissão de escrita como UX, com o controle real no servidor", () => {
    const data = read(`${agendaDirectory}/agenda-data.ts`);
    expect(data).toContain('requirePermission(clinicId, "appointment.view")');
    expect(data).toContain('requirePermission(clinicId, "appointment.manage")');
    // A tela recebe booleanos já resolvidos, não objetos de sessão.
    const types = codeOf(`${agendaDirectory}/agenda-types.ts`);
    expect(types).toContain("canManage");
    expect(types).not.toMatch(/\bclinicId\b/);
    expect(types).not.toMatch(/\bsession\b/i);
  });

  it("entrega estados de interface e operação por teclado", () => {
    const screen = read(`${agendaDirectory}/agenda-screen.tsx`);
    expect(screen).toContain("<EmptyState");
    expect(screen).toContain("<button");
    // A grade não depende de arrastar: cada card é um botão focável.
    expect(screen).toContain("focus-visible:outline");
    expect(screen).not.toContain("draggable");
    for (const route of routes) {
      expect(route.source).toContain("<ErrorState");
      expect(route.source).toContain("<AccessDeniedState");
    }
  });

  it("não guarda dados de agenda no navegador nem simula números", () => {
    expect(agendaTree).not.toContain("localStorage");
    expect(agendaTree).not.toContain("sessionStorage");
    expect(agendaTree).not.toMatch(/mockData|fakeData|dadosFicticios|placeholderRows/i);
  });

  it("centraliza formatação de moeda e status em um lugar só", () => {
    expect(agendaTree).toContain("formatBrlFromCents");
    // Nenhuma tela remonta "R$" na mão.
    expect(agendaTree).not.toMatch(/["'`]R\$\s/);
    const viewModel = read(`${agendaDirectory}/agenda-view-model.ts`);
    expect(viewModel).toContain("STATUS_LABELS");
    expect(viewModel).toContain("STATUS_TONES");
  });

  it("não adiciona dependência de runtime para desenhar o gráfico", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(packageJson.dependencies)).not.toContain("recharts");
    const chart = read(`${agendaDirectory}/day-chart.tsx`);
    expect(chart).toContain("<svg");
    // O gráfico nunca é a única leitura possível do dado.
    expect(chart).toContain("sr-only");
  });
});
