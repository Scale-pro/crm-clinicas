import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PipelineList } from "@/app/(clinic)/app/_pipelines/pipeline-list";
import type { PipelineView } from "@/app/(clinic)/app/_pipelines/pipeline-view-models";
import { INVITE_IDLE, type InviteState } from "@/app/(clinic)/app/_team/invite-state";
import { InviteMemberPanel } from "@/app/(clinic)/app/_team/invite-member-panel";
import { MemberList } from "@/app/(clinic)/app/_team/member-list";
import type { MemberRowView } from "@/app/(clinic)/app/_team/team-view-models";

const root = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

function filesUnder(relativeDirectory: string): string[] {
  return readdirSync(path.join(root, relativeDirectory), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  });
}

const clinicApp = "src/app/(clinic)/app";
const pipelinesDirectory = `${clinicApp}/_pipelines`;
const teamDirectory = `${clinicApp}/_team`;
const areaFiles = [...filesUnder(pipelinesDirectory), ...filesUnder(teamDirectory)];
const areaSurfaceFiles = areaFiles.filter((file) => !file.endsWith(".test.ts"));
const areaSurface = areaSurfaceFiles.map(read).join("\n");
const pipelinesPage = read(`${clinicApp}/settings/pipelines/page.tsx`);
const teamPage = read(`${clinicApp}/settings/team/page.tsx`);
const pages = `${pipelinesPage}\n${teamPage}`;
const pipelineActions = read(`${pipelinesDirectory}/actions.ts`);
const teamActions = read(`${teamDirectory}/actions.ts`);

const pipeline = (over: Partial<PipelineView> & { id: string }): PipelineView => ({
  archived: false,
  createdAtLabel: "10/03/2026 09:00",
  isDefault: false,
  name: `Pipeline ${over.id}`,
  stages: [],
  updatedAtLabel: "11/03/2026 09:00",
  ...over,
});

/** Ação inerte: o painel recebe a Server Action por prop. */
const noopAction = async (): Promise<InviteState> => INVITE_IDLE;

const member = (over: Partial<MemberRowView> & { userId: string }): MemberRowView => ({
  fullName: "Ana Ribeiro",
  isCurrentUser: false,
  role: "viewer",
  ...over,
});

describe("pipelines e equipe — rotas e fronteiras", () => {
  it("entrega as duas rotas de configuração", () => {
    for (const route of [
      `${clinicApp}/settings/pipelines/page.tsx`,
      `${clinicApp}/settings/team/page.tsx`,
    ]) {
      expect(existsSync(path.join(root, route))).toBe(true);
    }
  });

  it("resolve o tenant no servidor e nunca aceita clinicId do navegador", () => {
    for (const page of [pipelinesPage, teamPage]) {
      expect(page).toContain("resolveActiveClinicContext()");
      expect(page).toContain("const clinicId = context.clinic.id");
    }
    expect(pages).not.toMatch(/name="clinicId"/);
    for (const actions of [pipelineActions, teamActions]) {
      expect(actions).toContain("resolveActiveClinicContext()");
      expect(actions).not.toMatch(/field\(formData,\s*"clinicId"\)/);
    }
  });

  it("usa apenas a interface pública dos módulos, sem Supabase direto", () => {
    const sources = `${pages}\n${areaSurface}`;
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
    expect(sources).not.toMatch(/@\/modules\/[a-z-]+\//);
  });

  it("concentra as Server Actions em um arquivo por área", () => {
    // A diretiva só vale na primeira linha do arquivo — mencionar `"use server"`
    // em um comentário não torna o módulo um servidor.
    const serverModules = areaSurfaceFiles.filter((file) => read(file).startsWith('"use server"'));
    expect(serverModules.sort()).toEqual([
      `${pipelinesDirectory}/actions.ts`,
      `${teamDirectory}/actions.ts`,
    ].sort());
    expect(pages).not.toContain('"use server"');
  });

  it("usa as permissões reais do catálogo, sem inventar nomes", () => {
    expect(pipelinesPage).toContain('requirePermission(clinicId, "pipeline.manage")');
    expect(teamPage).toContain('requirePermission(clinicId, "member.invite")');
    // Permissões que não existem no catálogo não podem aparecer.
    const sources = `${pages}\n${areaSurface}`;
    for (const invented of [
      "pipeline.view", "clinic_member.view", "clinic_member.manage",
      "invitation.view", "invitation.manage", "role.view", "role.manage",
    ]) {
      expect(sources).not.toContain(invented);
    }
    // A permissão genérica não substitui as específicas.
    expect(pages).not.toContain("clinic.manage");
    expect(sources).not.toMatch(/role\s*===\s*["'`]owner["'`]\s*\?/);
  });

  it("criação leva idempotencyKey, e pipelines não fingem concorrência otimista", () => {
    expect(pipelineActions).toContain("idempotencyKey: randomUUID()");
    // Nenhuma RPC de pipeline aceita versão esperada — nenhum esquema declara
    // o campo, e nenhum formulário o envia.
    expect(pipelineActions).not.toMatch(/expectedVersion:\s*/);
    expect(pipelinesPage).not.toContain("expectedVersion");
    expect(pipelineActions).toContain("revalidatePath");
    expect(teamActions).toContain("revalidatePath");
  });

  it("cada formulário envia somente os seus campos", () => {
    // Renomear não carrega ordem; ordenar não carrega nome.
    expect(pipelineActions).toMatch(/renamePipelineAction[\s\S]*?name:\s*z\.string\(\)/);
    expect(pipelineActions).not.toMatch(/renamePipelineAction[\s\S]{0,600}stageIds/);
    expect(pipelineActions).not.toMatch(/reorderPipelineStagesAction[\s\S]{0,600}name:\s*field/);
  });

  it("não abre superfície de fases futuras", () => {
    const sources = `${pages}\n${areaSurface}`;
    for (const forbidden of [
      "whatsapp", "inbox", "agenda", "financeiro", "marketing",
      "meta-ads", "google-ads", "pixel", "openai",
    ]) {
      expect(sources.toLowerCase()).not.toContain(forbidden);
    }
    const settings = read(`${clinicApp}/settings/page.tsx`);
    expect(settings).toContain("/app/settings/pipelines");
    expect(settings).toContain("/app/settings/team");
  });

  it("não leva dados fictícios para produção — fixtures só em teste", () => {
    expect(areaSurface).not.toContain("Ana Ribeiro");
    for (const file of areaFiles) {
      if (read(file).includes("Ana Ribeiro")) expect(file.endsWith(".test.ts")).toBe(true);
    }
    expect(areaSurface).not.toMatch(/\b(?:mock|fake|dummy|demo|lorem|stub|seed|sample)(?:Data|Rows|Values|Items|Members|Pipelines)\b/i);
  });

  it("não altera backend, migrations nem dependências", () => {
    expect(filesUnder("supabase/migrations").length).toBe(28);
    expect(areaFiles.some((file) => file.endsWith(".sql"))).toBe(false);
    expect(areaSurface).not.toMatch(/create\s+(?:table|policy|function|index)\b/i);
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

describe("configuração de pipelines", () => {
  it("a lista lateral mostra padrão, arquivado e contagem de etapas", () => {
    const html = renderToStaticMarkup(createElement(PipelineList, {
      basePath: "/app/settings/pipelines",
      pipelines: [
        pipeline({ id: "p1", isDefault: true, name: "Comercial" }),
        pipeline({ archived: true, id: "p2", name: "Antigo" }),
      ],
      selectedId: "p1",
    }));
    expect(html).toContain("Comercial");
    expect(html).toContain("Antigo");
    expect(html).toContain("Padrão");
    expect(html).toContain("Arquivado");
    expect(html).toContain("0 etapa(s)");
    expect(html).toContain('aria-current="page"');
    // Nada de contagem de oportunidades: o contrato não a fornece.
    expect(html).not.toContain("oportunidade");
  });

  it("falha de leitura não vira “nenhum pipeline cadastrado”", () => {
    expect(pipelinesPage).toContain("Não foi possível carregar os pipelines");
    expect(pipelinesPage).toContain("Nenhum pipeline cadastrado");
    // O estado de erro vem antes de qualquer decisão sobre lista vazia.
    const errorIndex = pipelinesPage.indexOf("Não foi possível carregar os pipelines");
    const emptyIndex = pipelinesPage.indexOf("Nenhum pipeline cadastrado");
    expect(errorIndex).toBeLessThan(emptyIndex);
  });

  it("não oferece operação sem contrato público", () => {
    // Desarquivar pipeline, arquivar/remover etapa e cor de etapa não existem.
    for (const missing of [
      "unarchivePipeline", "restorePipeline", "reopenPipeline",
      "archivePipelineStage", "deletePipelineStage", "removePipelineStage",
    ]) {
      expect(`${pipelinesPage}\n${areaSurface}`).not.toContain(missing);
    }
    // E a tela diz isso em vez de simplesmente esconder.
    expect(pipelinesPage).toContain("restaurar exige uma alteração de backend");
    expect(pipelinesPage).toContain("Arquivar ou remover etapa não está disponível");
  });

  it("as proteções de arquivamento chegam à tela", () => {
    expect(pipelinesPage).toContain("canArchivePipeline");
    expect(pipelinesPage).toContain("archiveBlockedReason");
  });

  it("a ordenação envia a lista completa e só habilita quando algo mudou", () => {
    const editor = read(`${pipelinesDirectory}/stage-order-editor.tsx`);
    expect(editor).toContain("fullStageOrder(stages, openIds)");
    expect(editor).toContain("disabled={!dirty}");
    // Após salvar, o rascunho volta a espelhar o servidor.
    expect(editor).toContain("setOpenIds(initialOpenIds)");
  });
});

describe("equipe da clínica", () => {
  it("lista os membros com cargo e situação reais", () => {
    const html = renderToStaticMarkup(createElement(MemberList, {
      rows: [
        member({ fullName: "Ana Ribeiro", role: "owner", userId: "u1" }),
        member({ fullName: "Bruno Lima", isCurrentUser: true, role: "manager", userId: "u2" }),
      ],
      totalLabel: "2 membro(s) ativo(s) · página 1 de 1",
    }));
    expect(html).toContain("Ana Ribeiro");
    expect(html).toContain("Bruno Lima");
    expect(html).toContain("Proprietário");
    expect(html).toContain("Gestor");
    expect(html).toContain("Você");
    expect(html).toContain("2 membro(s) ativo(s)");
    // O identificador do usuário nunca aparece como conteúdo.
    expect(html).not.toContain(">u1<");
  });

  it("distingue vazio legítimo, busca sem resultado e erro", () => {
    const empty = renderToStaticMarkup(createElement(MemberList, { rows: [] }));
    expect(empty).toContain("Nenhum membro ativo");

    const filtered = renderToStaticMarkup(createElement(MemberList, { hasFilters: true, rows: [] }));
    expect(filtered).toContain("Nenhum membro para esta busca");
    expect(filtered).not.toContain("Nenhum membro ativo");

    const failed = renderToStaticMarkup(createElement(MemberList, { rows: [], state: "error" }));
    expect(failed).toContain("Não foi possível carregar a equipe");
    expect(failed).not.toContain("Nenhum membro ativo");
    expect(failed).not.toMatch(/SQLSTATE|PGRST|P4\d{3}|42501/i);
  });

  it("declara que a leitura cobre somente membros ativos", () => {
    const html = renderToStaticMarkup(createElement(MemberList, {
      rows: [member({ userId: "u1" })],
    }));
    expect(html).toContain("somente membros ativos");
  });

  it("o convite não oferece o cargo de proprietário", () => {
    const html = renderToStaticMarkup(createElement(InviteMemberPanel, { action: noopAction, canInvite: true }));
    expect(html).toContain("Convidar membro");
    expect(html).toContain("Somente leitura");
    expect(html).toContain("Administrador");
    expect(html).not.toContain("Proprietário</option>");
    expect(html).toContain("não pode ser concedido por convite");
    // O tenant não é campo do formulário.
    expect(html).not.toContain('name="clinicId"');
  });

  it("o link do convite chega à interface pelo estado da ação", async () => {
    // O contrato não envia e-mail: sem o link na tela, o convite fica inacessível.
    const link = "https://app.example.com/accept-invitation?token=token-de-teste";
    const created = async (): Promise<InviteState> => ({
      email: "novo@clinica.example",
      expiresInHours: 72,
      link,
      status: "created",
    });
    const html = renderToStaticMarkup(createElement(InviteMemberPanel, {
      action: created,
      canInvite: true,
      initialState: {
        email: "novo@clinica.example",
        expiresInHours: 72,
        link,
        status: "created",
      },
    }));
    expect(html).toContain(link);
    expect(html).toContain("novo@clinica.example");
    expect(html).toContain("Copiar link");
    // O texto não afirma envio automático — diz o contrário.
    expect(html).toContain("ainda não envia esse convite");
    expect(html).not.toContain("Convite enviado");
    expect(html).toContain("72 horas");
    expect(html).toContain("compartilhe somente");
    // Fallback selecionável quando a área de transferência não estiver disponível.
    expect(html).toContain("select-all");
  });

  it("o estado de erro não mostra link e não vaza mensagem técnica", () => {
    const html = renderToStaticMarkup(createElement(InviteMemberPanel, {
      action: noopAction,
      canInvite: true,
      initialState: { message: "Você não tem permissão para esta ação nesta clínica.", status: "error" },
    }));
    expect(html).toContain("não tem permissão");
    expect(html).not.toContain("accept-invitation");
    expect(html).not.toContain("token");
    expect(html).not.toMatch(/SQLSTATE|PGRST|42501|P4\d{3}/i);
  });

  it("o token nunca entra em redirect, query string ou log", () => {
    // A ação devolve estado; não redireciona e não escreve em lugar nenhum.
    expect(teamActions).not.toContain("redirect(");
    expect(teamActions).not.toMatch(/console\./);
    expect(teamActions).not.toMatch(/link=|token=|searchParams|URLSearchParams/);
    // O link só existe no estado `created`.
    expect(teamActions).toMatch(/link:\s*result\.link/);
    expect(teamActions).toMatch(/status:\s*"created"/);
    // A rota de equipe não carrega nada do convite na URL nem toca no link.
    expect(teamPage).not.toContain("member_invited");
    expect(teamPage).not.toContain("accept-invitation");
    expect(teamPage).not.toMatch(/\blink\s*[:=]/);
    const panel = read(`${teamDirectory}/invite-member-panel.tsx`);
    expect(panel).not.toMatch(/console\./);
  });

  it("sem permissão o contrato de convite nem é chamado", () => {
    const html = renderToStaticMarkup(createElement(InviteMemberPanel, {
      action: noopAction,
      canInvite: false,
    }));
    expect(html).not.toContain("<form");
    // A permissão é resolvida no servidor antes de renderizar o painel.
    expect(teamPage).toContain('requirePermission(clinicId, "member.invite")');
    expect(teamPage).toContain("canInvite={invitePermission.allowed}");
  });

  it("sem permissão de convite não existe botão de convite", () => {
    const html = renderToStaticMarkup(createElement(InviteMemberPanel, { action: noopAction, canInvite: false }));
    expect(html).toContain("exige a permissão de convite");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Enviar convite");
  });

  it("a borda recusa autoelevação a proprietário", () => {
    expect(teamActions).toContain('z.enum(["admin", "manager", "sdr", "receptionist", "professional", "viewer"])');
    expect(teamActions).not.toMatch(/z\.enum\(\[[^\]]*"owner"/);
  });

  it("operações sem contrato de escrita não viram botão", () => {
    for (const missing of [
      "removeClinicMember", "updateMemberRole", "deactivateClinicMember",
      "resendInvitation", "cancelInvitation", "listInvitations",
    ]) {
      expect(`${teamPage}\n${areaSurface}`).not.toContain(missing);
    }
    // A lacuna é declarada, não escondida.
    expect(teamPage).toContain("ainda não têm contrato público");
  });

  it("o último proprietário é explicado na tela", () => {
    expect(teamPage).toContain("ownerCount");
    expect(teamPage).toContain("removido ou rebaixado");
  });
});
