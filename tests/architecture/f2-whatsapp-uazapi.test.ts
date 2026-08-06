import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "../..");

function filesUnder(relativeDirectory: string): string[] {
  return readdirSync(path.join(root, relativeDirectory), { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.posix.join(relativeDirectory, entry.name);
      return entry.isDirectory() ? filesUnder(relative) : [relative];
    });
}

function source(relative: string): string {
  return readFileSync(path.join(root, relative), "utf8");
}

const migration = source(
  "supabase/migrations/20260806100000_f2_whatsapp_outbound_result_and_board.sql",
);

describe("adapter UAZAPI, envio e quadro (F2/WhatsApp)", () => {
  /*
   * A fronteira que sustenta "trocar de provedor não reescreve o CRM": todo
   * conhecimento do formato da UAZAPI mora em providers/uazapi/. Se o nome do
   * provedor vazar para o domínio, a próxima integração vira refatoração.
   */
  it("mantém o conhecimento da UAZAPI dentro de providers/uazapi", () => {
    const leaks = [
      ...filesUnder("src/modules").filter((file) =>
        /\.tsx?$/.test(file)
        && !file.includes("modules/whatsapp/providers/uazapi/")
        // A composição precisa nomear o provedor para decidir qual cliente usar
        // e qual conta cadastrar; o que ela não pode é conhecer o payload dele.
        && !file.endsWith("modules/whatsapp/delivery.ts")
        && !file.endsWith("modules/whatsapp/index.ts")),
      ...filesUnder("src/shared").filter((file) =>
        /\.tsx?$/.test(file)
        // Nomear o provedor numa variável de ambiente é configuração, não
        // conhecimento do formato dele.
        && !file.startsWith("src/shared/config/")),
    ].filter((file) => /uazapi/i.test(source(file)));

    expect(
      leaks,
      "Formato da UAZAPI só pode ser conhecido em providers/uazapi/. "
        + "O domínio fala o evento normalizado.",
    ).toEqual([]);
  });

  it("não deixa o adapter guardar mídia binária ou URL assinada", () => {
    const adapter = source("src/modules/whatsapp/providers/uazapi/inbound.ts");
    const builder = adapter.slice(adapter.indexOf("function buildAttachmentMetadata"));

    // A allowlist de `safeAttachmentMetadataSchema` é a regra; o adapter não
    // pode contorná-la montando chaves fora dela (ADR-012, decisão D3).
    const assigned = [...builder.matchAll(/metadata\.(\w+)\s*=/g)].map((match) => match[1]!);
    const allowed = [
      "caption", "fileName", "latitude", "longitude",
      "mediaId", "mimeType", "sha256", "sizeBytes",
    ];

    expect(assigned.length).toBeGreaterThan(0);
    expect(assigned.filter((key) => !allowed.includes(key))).toEqual([]);
  });

  /*
   * Exceção fechada do ADR-002 (decisão 3): webhook externo chega sem sessão,
   * logo sem JWT e sem RLS. O executor técnico é o preço disso, e o que o
   * mantém estreito é esta lista — mais um consumidor quebra o teste.
   */
  it("mantém o executor técnico restrito à lista fechada de consumidores", () => {
    const consumers = filesUnder("src")
      .filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"))
      .filter((file) => source(file).includes("createTechnicalRpcExecutor"));

    expect(new Set(consumers)).toEqual(new Set([
      "src/shared/db/technical.ts",
      "src/shared/db/index.ts",
      "src/app/api/whatsapp/uazapi/webhook/route.ts",
      "src/app/api/whatsapp/worker/route.ts",
    ]));
  });

  it("dá ao executor técnico apenas `rpc`, nunca acesso direto a tabela", () => {
    const technical = source("src/shared/db/technical.ts");
    const contract = technical.slice(
      technical.indexOf("export interface TechnicalRpcExecutor"),
      technical.indexOf("function requireSecretKey"),
    );

    // `client.from()` abriria leitura e escrita de qualquer tabela sem RLS —
    // e o contrato não pode sequer oferecer o método.
    expect([...contract.matchAll(/^\s{2}(\w+)[(<]/gm)].map((match) => match[1]!)).toEqual(["rpc"]);
    expect(technical).not.toContain("client.from(");
  });

  it("autentica as duas rotas técnicas antes de tocar no banco", () => {
    const webhook = source("src/app/api/whatsapp/uazapi/webhook/route.ts");
    const worker = source("src/app/api/whatsapp/worker/route.ts");

    // Comparação em tempo constante: `===` vaza o prefixo acertado.
    expect(webhook).toContain("timingSafeEqual");
    expect(webhook).toContain("status: 401");
    expect(worker).toContain("verifyQStashSignature");
    expect(worker).toContain("status: 401");
  });

  it("concede as RPCs novas ao papel certo e revoga de authenticated", () => {
    const serviceRoleOnly = [
      "mark_whatsapp_event_ignored",
      "get_whatsapp_event_for_processing",
      "get_whatsapp_send_credential",
      "record_whatsapp_send_result",
    ];
    for (const rpc of serviceRoleOnly) {
      expect(migration, rpc).toMatch(
        new RegExp(`revoke all on function public\\.${rpc}\\([^)]*\\)\\s*\nfrom public, anon, authenticated`),
      );
      expect(migration, rpc).toMatch(
        new RegExp(`grant execute on function public\\.${rpc}\\([^)]*\\)\\s*to service_role`),
      );
    }

    // Cadastrar credencial é ação de usuário responsável, não de máquina.
    expect(migration).toMatch(/grant execute on function public\.set_whatsapp_account_secret[\s\S]{0,80}to authenticated/);
    expect(migration).not.toMatch(/set_whatsapp_account_secret\([^)]*\)\s*\nto service_role/);
  });

  it("guarda o token do provedor fora do alcance de qualquer sessão de usuário", () => {
    expect(migration).toContain("create table app_private.whatsapp_account_secrets");
    expect(migration).toMatch(
      /revoke all on table app_private\.whatsapp_account_secrets\s*\nfrom public, anon, authenticated, service_role/,
    );
    // A cifragem é da aplicação: nada de chave passando por parâmetro de RPC.
    expect(migration).not.toMatch(/pgp_sym_encrypt|pgp_sym_decrypt/);
  });

  it("exige clinic.manage e AAL2 para configurar a credencial", () => {
    expect(migration).toMatch(/has_permission\(p_clinic_id, 'clinic\.manage'\)/);
    expect(migration).toContain("app_private.require_aal2()");
  });

  it("mantém o quadro como security invoker, para a RLS decidir o que a conversa mostra", () => {
    const board = migration.slice(migration.indexOf("create function public.search_opportunity_board"));

    expect(board).toContain("security invoker");
    expect(board).toContain("p_unread_only");
    // Uma linha por oportunidade: duas contas de WhatsApp na mesma clínica
    // duplicariam cards e quebrariam contagem e paginação.
    expect(board).toContain("left join lateral");
    expect(board).toContain("limit 1");
  });

  it("não deixa rótulo de interface nem pt-BR de apresentação dentro do SQL", () => {
    // O RPC devolve `message_type`; quem traduz para "Áudio"/"Imagem" é a UI.
    for (const label of ["Imagem", "Áudio", "Vídeo", "Documento", "📷", "🎤"]) {
      expect(migration, label).not.toContain(label);
    }
  });

  it("cifra a credencial com modo autenticado e chave de ambiente", () => {
    const credentials = source("src/modules/whatsapp/credentials.ts");

    expect(credentials).toContain("aes-256-gcm");
    expect(credentials).toContain("getAuthTag");
    expect(credentials).toContain("WHATSAPP_CREDENTIAL_KEY");
  });

  it("mantém segredo e telefone fora dos logs das rotas técnicas", () => {
    const routes = [
      source("src/app/api/whatsapp/uazapi/webhook/route.ts"),
      source("src/app/api/whatsapp/worker/route.ts"),
    ].join("\n");

    // Só chaves da allowlist de `shared/observability` chegam ao logger.
    const logged = [...routes.matchAll(/logger\.\w+\([^)]*\{([\s\S]*?)\}\s*\)/g)]
      .flatMap((match) => [...match[1]!.matchAll(/(\w+):/g)].map((key) => key[1]!));
    const allowed = new Set([
      "clinic_id", "event_id", "request_id", "connection_id", "provider", "status", "error_code",
    ]);

    expect(logged.length).toBeGreaterThan(0);
    expect(
      logged.filter((key) => !allowed.has(key)),
      "Só as chaves técnicas da allowlist de shared/observability podem ser registradas (ADR-012).",
    ).toEqual([]);
  });
});
