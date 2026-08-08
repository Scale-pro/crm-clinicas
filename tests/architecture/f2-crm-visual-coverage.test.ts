import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ContactDetail } from "@/app/(clinic)/app/_crm/contact-detail";
import { ContactList } from "@/app/(clinic)/app/_crm/contact-list";
import type {
  ContactRowView,
  OpportunityRowView,
} from "@/app/(clinic)/app/_crm/crm-view-models";
import {
  OpportunityHistory,
  OpportunitySummary,
} from "@/app/(clinic)/app/_crm/opportunity-detail";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function filesUnder(relativeDirectory: string): string[] {
  return readdirSync(path.join(root, relativeDirectory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  });
}

const clinicApp = "src/app/(clinic)/app";
const crmDirectory = `${clinicApp}/_crm`;
const crmFiles = filesUnder(crmDirectory);
const crmSurfaceFiles = crmFiles.filter((file) => !file.endsWith(".test.ts"));
const crmSurface = crmSurfaceFiles.map(read).join("\n");
const contactsPage = read(`${clinicApp}/contacts/page.tsx`);
const contactDetailPage = read(`${clinicApp}/contacts/[contactId]/page.tsx`);
const opportunityPage = read(`${clinicApp}/opportunities/[opportunityId]/page.tsx`);
const pages = `${contactsPage}\n${contactDetailPage}\n${opportunityPage}`;
const actions = read(`${crmDirectory}/actions.ts`);

// --- Fixtures: existem só neste arquivo de teste --------------------------

function contactRow(over: Partial<ContactRowView> = {}): ContactRowView {
  return {
    archived: false,
    createdAtLabel: "10/03/2026 09:15",
    fullName: "Ana Ribeiro",
    href: "/app/contacts/contact-1",
    id: "contact-1",
    ownerName: "Bruno Lima",
    ...over,
  };
}

function opportunityRow(over: Partial<OpportunityRowView> = {}): OpportunityRowView {
  return {
    amountCents: 250_000,
    assigneeName: "Bruno Lima",
    href: "/app/opportunities/opportunity-1",
    id: "opportunity-1",
    pipelineName: "Comercial",
    sourceName: "Indicação",
    stageName: "Proposta",
    status: "open",
    title: "Harmonização facial",
    updatedAtLabel: "11/03/2026 14:02",
    ...over,
  };
}

const contactFixture = {
  archived: false,
  createdAtLabel: "10/03/2026 09:15",
  fullName: "Ana Ribeiro",
  id: "contact-1",
  isPatient: false,
  methods: [
    {
      displayValue: "(11) 91234-5678",
      id: "method-1",
      isPrimary: true,
      isWhatsapp: true,
      kind: "phone" as const,
      label: null,
      rawValue: "+5511912345678",
    },
  ],
  notes: null,
  ownerName: "Bruno Lima",
  patientSinceLabel: null,
  updatedAtLabel: "11/03/2026 10:00",
};

describe("cobertura visual do CRM — rotas e fronteiras", () => {
  it("entrega listagem de contatos, Lead 360 e detalhe de oportunidade", () => {
    for (const route of [
      `${clinicApp}/contacts/page.tsx`,
      `${clinicApp}/contacts/[contactId]/page.tsx`,
      `${clinicApp}/opportunities/[opportunityId]/page.tsx`,
    ]) {
      expect(existsSync(path.join(root, route))).toBe(true);
    }
  });

  it("resolve tenant no servidor e nunca aceita clinicId do navegador", () => {
    for (const page of [contactsPage, contactDetailPage, opportunityPage]) {
      expect(page).toContain("resolveActiveClinicContext()");
      expect(page).toContain("const clinicId = context.clinic.id");
    }
    // Nenhuma página injeta o tenant em formulário.
    expect(pages).not.toMatch(/name="clinicId"/);
    // As ações desta entrega não leem `clinicId` da entrada: ele é resolvido.
    expect(actions).toContain("resolveActiveClinicContext()");
    expect(actions).not.toMatch(/field\(formData,\s*"clinicId"\)/);
  });

  it("usa apenas a interface pública dos módulos, sem Supabase direto", () => {
    const sources = `${pages}\n${crmSurface}`;
    for (const forbidden of [
      "createServerSupabaseClient",
      "@supabase/",
      "@/shared/db",
      "database.types",
      "service_role",
      "SERVICE_ROLE",
      "supabase.rpc",
    ]) {
      expect(sources).not.toContain(forbidden);
    }
    // Somente o índice público — nunca um caminho interno de módulo.
    expect(sources).not.toMatch(/@\/modules\/[a-z-]+\//);
  });

  it("concentra as Server Actions em um único arquivo da área", () => {
    const serverModules = crmSurfaceFiles.filter((file) => read(file).includes('"use server"'));
    expect(serverModules).toEqual([`${crmDirectory}/actions.ts`]);
    expect(pages).not.toContain('"use server"');
  });

  it("aplica as permissões públicas exigidas, sem trocar por clinic.manage", () => {
    expect(contactsPage).toContain('requirePermission(clinicId, "contact.archive")');
    expect(contactsPage).toContain('requirePermission(clinicId, "contact.create")');
    expect(contactDetailPage).toContain("requireContactEditAccess(clinicId, contactId)");
    expect(contactDetailPage).toContain('requirePermission(clinicId, "contact.archive")');
    // O detalhe da oportunidade usa as permissões que o próprio contrato resolve.
    expect(opportunityPage).toContain("result.permissions");
    for (const page of [contactsPage, contactDetailPage, opportunityPage]) {
      expect(page).not.toContain("clinic.manage");
    }
    // Autorização nunca por comparação de cargo.
    const sources = `${pages}\n${crmSurface}`;
    expect(sources).not.toMatch(/role\s*===\s*["'`]/);
    expect(sources).not.toMatch(/["'`](?:owner|admin|manager)["'`]\s*===/);
  });

  it("atualizações levam versão esperada e revalidam a rota", () => {
    expect(actions).toContain("expectedVersion");
    expect(actions).toContain("revalidatePath");
    // Toda ação de oportunidade envia a versão que estava em tela.
    const versionUses = actions.match(/expectedVersion: version/g) ?? [];
    expect(versionUses.length).toBeGreaterThanOrEqual(5);
  });

  it("não abre superfície de fases futuras nem importa o núcleo de WhatsApp", () => {
    const sources = `${pages}\n${crmSurface}`;
    for (const forbidden of ["whatsapp-core", "evolution", "meta-ads", "google-ads", "openai"]) {
      expect(sources.toLowerCase()).not.toContain(forbidden);
    }
    // A aba de comunicação declara a ausência — não simula mensagens.
    const detail = read(`${crmDirectory}/contact-detail.tsx`);
    expect(detail).toContain("Conversas ainda não disponíveis");
    expect(detail).not.toMatch(/\b(?:mock|fake|dummy|sample)(?:Messages|Conversations|Data)\b/i);
  });

  it("não leva dados fictícios para produção — fixtures só em teste", () => {
    expect(crmSurface).not.toContain("Ana Ribeiro");
    for (const file of crmFiles) {
      if (read(file).includes("Ana Ribeiro")) expect(file.endsWith(".test.ts")).toBe(true);
    }
    expect(crmSurface).not.toMatch(/\b(?:mock|fake|dummy|demo|lorem|stub|seed|sample)(?:Data|Rows|Values|Items|Contacts|Opportunities)\b/i);
  });

  it("não altera backend, migrations nem dependências", () => {
    const migrations = filesUnder("supabase/migrations");
    expect(migrations.length).toBe(28);
    expect(crmFiles.some((file) => file.endsWith(".sql"))).toBe(false);
    expect(crmSurface).not.toMatch(/create\s+(?:table|policy|function|index)\b/i);
    const packageJson = JSON.parse(read("package.json")) as { dependencies: Record<string, string> };
    expect(Object.keys(packageJson.dependencies)).toEqual([
      "@radix-ui/react-slot",
      "@supabase/ssr",
      "@supabase/supabase-js",
      "class-variance-authority",
      "clsx",
      "lucide-react",
      "next",
      "react",
      "react-dom",
      "server-only",
      "tailwind-merge",
      "zod",
    ]);
  });
});

describe("listagem de contatos", () => {
  it("mostra as linhas reais e declara o escopo aplicado pelo servidor", () => {
    const html = renderToStaticMarkup(createElement(ContactList, {
      rows: [contactRow(), contactRow({ archived: true, fullName: "Bruno Lima", id: "contact-2", ownerName: null })],
      scopeNote: "Exibindo contatos de toda a clínica.",
    }));
    expect(html).toContain("Ana Ribeiro");
    expect(html).toContain("Bruno Lima");
    expect(html).toContain("Ativo");
    expect(html).toContain("Arquivado");
    expect(html).toContain("Sem responsável");
    expect(html).toContain("Exibindo contatos de toda a clínica.");
    expect(html).toContain('href="/app/contacts/contact-1"');
    // O identificador técnico nunca aparece como conteúdo.
    expect(html).not.toContain(">contact-1<");
    expect(html).toContain("<table");
    expect(html).toContain("<caption");
    expect(html).toContain('scope="row"');
  });

  it("distingue vazio legítimo de busca sem resultado e de erro", () => {
    const empty = renderToStaticMarkup(createElement(ContactList, { rows: [] }));
    expect(empty).toContain("Nenhum contato cadastrado");

    const filtered = renderToStaticMarkup(createElement(ContactList, { hasFilters: true, rows: [] }));
    expect(filtered).toContain("Nenhum contato para estes filtros");
    expect(filtered).not.toContain("Nenhum contato cadastrado");

    const failed = renderToStaticMarkup(createElement(ContactList, { rows: [], state: "error" }));
    expect(failed).toContain("Não foi possível carregar os contatos");
    expect(failed).not.toContain("Nenhum contato cadastrado");
    expect(failed).not.toMatch(/SQLSTATE|PGRST|P4\d{3}|23505/i);
  });

  it("cobre o carregamento com estado próprio", () => {
    const loading = renderToStaticMarkup(createElement(ContactList, { rows: [], state: "loading" }));
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain("Carregando contatos…");
  });

  it("avisa quando o resultado pode estar truncado, em vez de fingir paginação", () => {
    const html = renderToStaticMarkup(createElement(ContactList, {
      limitNote: "Exibindo os 25 contatos mais recentes deste filtro; pode haver mais.",
      rows: [contactRow()],
    }));
    expect(html).toContain("pode haver mais");
    // A tela não promete páginas que o contrato não entrega.
    expect(html).not.toContain("Próxima");
    expect(html).not.toContain("Página ");
  });

  it("a rota só oferece filtros que o contrato aplica", () => {
    const filters = read(`${crmDirectory}/contact-filters.tsx`);
    // `SearchField` publica o termo como `q`; os demais filtros são explícitos.
    expect(filters).toContain("<SearchField");
    expect(filters).toContain('name="owner"');
    expect(filters).toContain('name="archived"');
    expect(contactsPage).toContain("params.q");
    // `listContacts` recebe exatamente esses filtros.
    expect(contactsPage).toContain("includeArchived");
    expect(contactsPage).toContain("ownerUserId: owner || null");
    expect(contactsPage).toContain("search");
    // Arquivados só são pedidos quando a permissão existe.
    expect(contactsPage).toContain("requestedArchived && archivePermission.allowed");
  });
});

describe("Lead 360", () => {
  it("apresenta somente dados reais, com abas de resumo, oportunidades, histórico e comunicação", () => {
    const html = renderToStaticMarkup(createElement(ContactDetail, {
      activities: [{ id: "activity-1", label: "Contato cadastrado", occurredAtLabel: "10/03/2026 09:15" }],
      contact: contactFixture,
      opportunities: [opportunityRow()],
    }));
    for (const tab of ["Resumo", "Oportunidades", "Histórico", "Comunicação"]) {
      expect(html).toContain(tab);
    }
    expect(html).toContain('role="tablist"');
    expect([...html.matchAll(/role="tab"/g)]).toHaveLength(4);
    expect(html).toContain("(11) 91234-5678");
    expect(html).toContain("Principal");
    expect(html).toContain("WhatsApp");
    expect(html).toContain("Nenhuma observação cadastrada.");
  });

  it("a aba Comunicação declara a ausência do WhatsApp sem simular mensagens", () => {
    const html = renderToStaticMarkup(createElement(ContactDetail, {
      activities: [],
      contact: contactFixture,
      defaultTabKey: "communication",
      opportunities: [],
    }));
    expect(html).toContain("Conversas ainda não disponíveis");
    expect(html).toContain("Nenhuma mensagem é exibida antes disso");
  });

  it("oportunidades não carregadas não viram “nenhuma oportunidade”", () => {
    const failed = renderToStaticMarkup(createElement(ContactDetail, {
      activities: [],
      contact: contactFixture,
      defaultTabKey: "opportunities",
      opportunities: null,
    }));
    expect(failed).toContain("Não foi possível carregar as oportunidades deste contato");
    expect(failed).toContain("Oportunidades não carregadas");
    expect(failed).not.toContain("Nenhuma oportunidade para este contato");

    const empty = renderToStaticMarkup(createElement(ContactDetail, {
      activities: [],
      contact: contactFixture,
      defaultTabKey: "opportunities",
      opportunities: [],
    }));
    expect(empty).toContain("Nenhuma oportunidade para este contato");
    expect(empty).toContain("0 oportunidade(s)");
  });

  it("origem vem das oportunidades reais do contato, nunca inventada", () => {
    const withSource = renderToStaticMarkup(createElement(ContactDetail, {
      activities: [],
      contact: contactFixture,
      opportunities: [opportunityRow({ sourceName: "Indicação" })],
    }));
    expect(withSource).toContain("Indicação");

    const withoutSource = renderToStaticMarkup(createElement(ContactDetail, {
      activities: [],
      contact: contactFixture,
      opportunities: [opportunityRow({ sourceName: null })],
    }));
    expect(withoutSource).toContain("Nenhuma origem registrada nas oportunidades");
  });

  it("histórico vazio é declarado, e nenhum tipo cru aparece na tela", () => {
    const html = renderToStaticMarkup(createElement(ContactDetail, {
      activities: [],
      contact: contactFixture,
      defaultTabKey: "history",
      opportunities: [],
    }));
    expect(html).toContain("Nenhuma atividade registrada");
    expect(html).not.toContain("contact.created");
  });

  it("a busca de oportunidades do contato usa o identificador, nunca o nome", () => {
    const loader = read(`${crmDirectory}/contact-opportunities.ts`);
    expect(loader).toContain("card.contact_id === contactId");
    // Buscar pelo nome traria oportunidades de homônimos.
    expect(loader).not.toMatch(/search:\s*(?:contact|fullName|name)/);
    expect(loader).toContain("complete");
  });
});

describe("detalhe da oportunidade", () => {
  const opportunity = {
    amountCents: 250_000,
    assigneeName: "Bruno Lima",
    closeReason: null,
    closedAtLabel: null,
    contactHref: "/app/contacts/contact-1",
    contactName: "Ana Ribeiro",
    createdAtLabel: "10/03/2026 09:15",
    id: "opportunity-1",
    pipelineName: "Comercial",
    sourceName: "Indicação",
    stageName: "Proposta",
    status: "open" as const,
    title: "Harmonização facial",
    updatedAtLabel: "11/03/2026 14:02",
  };

  it("resume os campos reais e liga ao contato", () => {
    const html = renderToStaticMarkup(createElement(OpportunitySummary, { opportunity }));
    expect(html).toContain("Aberta");
    expect(html).toContain("Ana Ribeiro");
    expect(html).toContain('href="/app/contacts/contact-1"');
    expect(html).toContain("Comercial");
    expect(html).toContain("Proposta");
    expect(html).toContain("Indicação");
    expect(html).toContain("Bruno Lima");
    expect(html).toContain("10/03/2026 09:15");
  });

  it("campo sem dado mostra “—” em vez de identificador ou nome inventado", () => {
    const html = renderToStaticMarkup(createElement(OpportunitySummary, {
      opportunity: {
        ...opportunity,
        amountCents: null,
        assigneeName: null,
        contactHref: null,
        contactName: null,
        pipelineName: null,
        sourceName: null,
        stageName: null,
      },
    }));
    expect(html).toContain("—");
    expect(html).toContain("Sem responsável");
    expect(html).toContain("Sem origem");
    expect(html).toContain("Não informado");
    expect(html).not.toContain("opportunity-1");
  });

  it("histórico mostra movimentações resolvidas em nomes", () => {
    const html = renderToStaticMarkup(createElement(OpportunityHistory, {
      events: [{
        fromLabel: "Primeiro contato",
        id: "event-1",
        occurredAtLabel: "11/03/2026 14:02",
        reason: "Cliente pediu revisão",
        toLabel: "Proposta",
      }],
    }));
    expect(html).toContain("Primeiro contato");
    expect(html).toContain("Proposta");
    expect(html).toContain("Cliente pediu revisão");
    expect(html).not.toContain("stage-");
  });

  it("histórico vazio é declarado como ausência de movimentação", () => {
    const html = renderToStaticMarkup(createElement(OpportunityHistory, { events: [] }));
    expect(html).toContain("Nenhuma movimentação registrada");
  });

  it("a perda exige motivo e a reabertura respeita a janela do contrato", () => {
    // O motivo da perda é campo persistido pelo contrato, não decorativo.
    expect(opportunityPage).toContain('name="closeReason"');
    expect(opportunityPage).toContain("required");
    expect(opportunityPage).toContain("canReopenAt(opportunity.closed_at)");
    // Ganho não pede motivo.
    expect(opportunityPage).toContain('value="won"');
    expect(opportunityPage).toContain('value="lost"');
  });
});
