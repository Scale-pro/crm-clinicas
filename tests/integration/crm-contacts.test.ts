import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createTestAdminClient,
  createTestUserClient,
} from "./helpers/create-test-admin-client";
import { createTestDbPool } from "./helpers/create-test-db-client";
import { currentTotp } from "./helpers/totp";

const password = "Local-only-test-password-123!";
const pool = createTestDbPool();
const admin = createTestAdminClient();
const userIds: string[] = [];
const clinicIds: string[] = [];

type FixtureUser = Awaited<ReturnType<typeof createUser>>;
let ownerA: FixtureUser;
let ownerB: FixtureUser;
let managerA: FixtureUser;
let sdrA: FixtureUser;
let receptionistA: FixtureUser;
let professionalA: FixtureUser;
let viewerA: FixtureUser;
let platformAdmin: FixtureUser;
let clinicA: string;
let clinicB: string;
let sdrContact: string;
let managerContact: string;

async function createUser(label: string, aal2 = false) {
  const email = `${label}-${crypto.randomUUID()}@example.test`;
  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password,
  });
  if (created.error || !created.data.user) throw created.error;
  userIds.push(created.data.user.id);
  const client = createTestUserClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  if (aal2) {
    const enrolled = await client.auth.mfa.enroll({ factorType: "totp" });
    if (enrolled.error || !enrolled.data || !("totp" in enrolled.data)) {
      throw enrolled.error;
    }
    const verified = await client.auth.mfa.challengeAndVerify({
      factorId: enrolled.data.id,
      code: currentTotp(enrolled.data.totp.secret),
    });
    if (verified.error) throw verified.error;
  }
  return { client, email, id: created.data.user.id };
}

async function createContact(
  actor: FixtureUser,
  clinicId: string,
  name: string,
  methods: unknown[] = [],
  idempotencyKey = crypto.randomUUID(),
) {
  const result = await actor.client.rpc("create_contact", {
    clinic_id: clinicId,
    full_name: name,
    notes: null,
    idempotency_key: idempotencyKey,
    methods,
    link_as_patient: false,
  });
  if (result.error || typeof result.data !== "string") throw result.error;
  return result.data;
}

async function searchContacts(
  actor: FixtureUser,
  clinicId: string,
  search: string,
  options: {
    includeArchived?: boolean;
    limit?: number;
    normalizedValue?: string | null;
    ownerUserId?: string | null;
  } = {},
) {
  const result = await actor.client.rpc("search_contacts", {
    p_clinic_id: clinicId,
    p_include_archived: options.includeArchived ?? false,
    p_limit: options.limit ?? 50,
    p_normalized_value: options.normalizedValue ?? null,
    p_owner_user_id: options.ownerUserId ?? null,
    p_search_term: search.trim(),
  });
  if (result.error) throw result.error;
  return result.data as { created_at: string; full_name: string; id: string }[];
}

beforeAll(async () => {
  [ownerA, ownerB, managerA, sdrA, receptionistA, professionalA, viewerA, platformAdmin] =
    await Promise.all([
      createUser("crm-owner-a", true),
      createUser("crm-owner-b"),
      createUser("crm-manager"),
      createUser("crm-sdr"),
      createUser("crm-receptionist"),
      createUser("crm-professional"),
      createUser("crm-viewer"),
      createUser("crm-platform-admin"),
    ]);
  const clinics = await pool.query<{ id: string; name: string }>(
    `insert into public.clinics (name, slug, timezone, created_by)
     values
       ('Clínica CRM Fictícia A', $1, 'America/Sao_Paulo', $3),
       ('Clínica CRM Fictícia B', $2, 'America/Sao_Paulo', $4)
     returning id, name`,
    [`crm-a-${crypto.randomUUID()}`, `crm-b-${crypto.randomUUID()}`, ownerA.id, ownerB.id],
  );
  clinicA = clinics.rows.find((clinic) => clinic.name.endsWith("A"))!.id;
  clinicB = clinics.rows.find((clinic) => clinic.name.endsWith("B"))!.id;
  clinicIds.push(clinicA, clinicB);
  await pool.query(
    `insert into public.clinic_members (clinic_id, user_id, role)
     values
       ($1, $3, 'owner'), ($2, $4, 'owner'), ($1, $5, 'manager'),
       ($1, $6, 'sdr'), ($1, $7, 'receptionist'), ($1, $8, 'professional'),
       ($1, $9, 'viewer')`,
    [
      clinicA,
      clinicB,
      ownerA.id,
      ownerB.id,
      managerA.id,
      sdrA.id,
      receptionistA.id,
      professionalA.id,
      viewerA.id,
    ],
  );
  await pool.query(
    "insert into public.platform_admins (user_id, created_by) values ($1, $1)",
    [platformAdmin.id],
  );
  sdrContact = await createContact(sdrA, clinicA, "Contato SDR Fictício");
  managerContact = await createContact(managerA, clinicA, "Contato Manager Fictício");
});

afterAll(async () => {
  if (clinicIds.length) {
    await pool.query("delete from public.audit_logs where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.activities where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.patients where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.person_contacts where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.contacts where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.lead_sources where clinic_id = any($1::uuid[])", [clinicIds]);
    await pool.query("delete from public.clinics where id = any($1::uuid[])", [clinicIds]);
  }
  await pool.query("delete from public.platform_admins where user_id = $1", [platformAdmin?.id]);
  for (const userId of userIds) await admin.auth.admin.deleteUser(userId);
  await pool.end();
});

describe("CRM F2.1 multi-tenant", () => {
  it("semeia exatamente a matriz de sete permissões", async () => {
    const { rows } = await pool.query<{ permission: string; role: string }>(
      `select role, permission from public.role_permissions
       where permission like 'contact.%' or permission = 'lead_source.manage'
       order by role, permission`,
    );
    const byRole = Map.groupBy(rows, (row) => row.role);
    expect(byRole.get("owner")).toHaveLength(7);
    expect(byRole.get("admin")).toHaveLength(7);
    expect(byRole.get("manager")).toHaveLength(6);
    expect(byRole.get("sdr")?.map((row) => row.permission).sort()).toEqual([
      "contact.create",
      "contact.edit_own",
      "contact.view_own",
    ]);
    expect(byRole.get("receptionist")).toHaveLength(4);
    expect(byRole.get("professional")?.map((row) => row.permission)).toEqual([
      "contact.view_own",
    ]);
    expect(byRole.get("viewer")?.map((row) => row.permission)).toEqual([
      "contact.view_all",
    ]);
  });

  it("resolve own/all e bloqueia escrita de viewer/professional", async () => {
    const own = await sdrA.client.from("contacts").select("id").eq("clinic_id", clinicA);
    const all = await managerA.client.from("contacts").select("id").eq("clinic_id", clinicA);
    const viewerWrite = await viewerA.client.rpc("update_contact", {
      clinic_id: clinicA,
      contact_id: managerContact,
      full_name: "Alteração proibida",
      notes: null,
      expected_version: 1,
    });
    const professionalCreate = await professionalA.client.rpc("create_contact", {
      clinic_id: clinicA,
      full_name: "Criação proibida",
      idempotency_key: crypto.randomUUID(),
      methods: [],
      link_as_patient: false,
      notes: null,
    });
    expect(own.data?.map((row) => row.id)).toEqual([sdrContact]);
    expect(new Set(all.data?.map((row) => row.id))).toEqual(
      new Set([sdrContact, managerContact]),
    );
    expect(viewerWrite.error).not.toBeNull();
    expect(professionalCreate.error).not.toBeNull();
  });

  it("garante idempotência por clínica e owner derivado de auth.uid", async () => {
    const key = crypto.randomUUID();
    const first = await createContact(sdrA, clinicA, "Submissão Idempotente", [], key);
    const repeated = await createContact(sdrA, clinicA, "Nome ignorado no replay", [], key);
    const otherKey = await createContact(sdrA, clinicA, "Outra submissão", []);
    const otherClinic = await createContact(ownerB, clinicB, "Mesma chave outro tenant", [], key);
    const persisted = await pool.query<{ owner_user_id: string }>(
      "select owner_user_id from public.contacts where id = $1",
      [first],
    );
    expect(repeated).toBe(first);
    expect(otherKey).not.toBe(first);
    expect(otherClinic).not.toBe(first);
    expect(persisted.rows).toEqual([{ owner_user_id: sdrA.id }]);
  });

  it("busca no banco além dos 100 mais recentes sem contornar RLS ou arquivamento", async () => {
    const oldest = await pool.query<{ id: string }>(
      `insert into public.contacts
         (clinic_id, full_name, owner_user_id, created_by, updated_by, created_at, updated_at)
       values ($1, 'Maria Silva Pesquisa Antiga', $2, $2, $2, '2000-01-01T00:00:00Z', '2000-01-01T00:00:00Z')
       returning id`,
      [clinicA, sdrA.id],
    );
    const oldestId = oldest.rows[0]!.id;
    await pool.query(
      `insert into public.contacts
         (clinic_id, full_name, owner_user_id, created_by, updated_by)
       select $1, 'Contato lote busca ' || lpad(series::text, 3, '0'), $2, $2, $2
       from generate_series(1, 120) as series`,
      [clinicA, managerA.id],
    );
    await pool.query(
      `insert into public.person_contacts
         (clinic_id, contact_id, kind, raw_value, normalized_value, is_primary)
       values
         ($1, $2, 'phone', '(11) 99876-5432', '+5511998765432', true),
         ($1, $2, 'email', 'Maria.Antiga+crm@Example.Test', 'maria.antiga+crm@example.test', true)`,
      [clinicA, oldestId],
    );
    const crossTenant = await pool.query<{ id: string }>(
      `insert into public.contacts
         (clinic_id, full_name, owner_user_id, created_by, updated_by)
       values ($1, 'Maria Silva Pesquisa Antiga', $2, $2, $2)
       returning id`,
      [clinicB, ownerB.id],
    );
    await pool.query(
      `insert into public.person_contacts
         (clinic_id, contact_id, kind, raw_value, normalized_value, is_primary)
       values
         ($1, $2, 'phone', '(11) 99876-5432', '+5511998765432', true),
         ($1, $2, 'email', 'Maria.Antiga+crm@Example.Test', 'maria.antiga+crm@example.test', true)`,
      [clinicB, crossTenant.rows[0]!.id],
    );

    for (const [search, normalizedValue] of [
      ["Maria Silva Pesquisa Antiga", null],
      ["(11) 99876-5432", "+5511998765432"],
      [" Maria.Antiga+crm@Example.Test ", "maria.antiga+crm@example.test"],
    ] as const) {
      expect((await searchContacts(sdrA, clinicA, search, { normalizedValue }))
        .map((contact) => contact.id))
        .toEqual([oldestId]);
    }
    expect(await searchContacts(sdrA, clinicA, "Pessoa inexistente na busca"))
      .toEqual([]);

    const limited = await searchContacts(managerA, clinicA, "Contato lote busca", { limit: 7 });
    expect(limited).toHaveLength(7);
    expect(limited.map((contact) => contact.id))
      .toEqual(limited.map((contact) => contact.id).toSorted());

    expect(await searchContacts(sdrA, clinicA, "Contato Manager Fictício")).toEqual([]);
    expect((await searchContacts(managerA, clinicA, "Contato Manager Fictício"))[0]?.id)
      .toBe(managerContact);

    const orphan = await pool.query<{ id: string }>(
      `insert into public.contacts
         (clinic_id, full_name, owner_user_id, created_by, updated_by)
       values ($1, 'Contato Órfão Pesquisável', null, $2, $2)
       returning id`,
      [clinicA, ownerA.id],
    );
    expect(await searchContacts(sdrA, clinicA, "Contato Órfão Pesquisável")).toEqual([]);
    expect((await searchContacts(managerA, clinicA, "Contato Órfão Pesquisável"))[0]?.id)
      .toBe(orphan.rows[0]!.id);

    const archived = await pool.query<{ id: string }>(
      `insert into public.contacts
         (clinic_id, full_name, owner_user_id, archived_at, created_by, updated_by)
       values ($1, 'Contato Arquivado Pesquisável', $2, statement_timestamp(), $2, $2)
       returning id`,
      [clinicA, ownerA.id],
    );
    expect(await searchContacts(ownerA, clinicA, "Contato Arquivado Pesquisável"))
      .toEqual([]);
    expect((await searchContacts(ownerA, clinicA, "Contato Arquivado Pesquisável", {
      includeArchived: true,
    }))[0]?.id).toBe(archived.rows[0]!.id);

    const archivedMethodContact = await pool.query<{ id: string }>(
      `insert into public.contacts
         (clinic_id, full_name, owner_user_id, created_by, updated_by)
       values ($1, 'Contato com Meio Arquivado', $2, $2, $2)
       returning id`,
      [clinicA, ownerA.id],
    );
    await pool.query(
      `insert into public.person_contacts
         (clinic_id, contact_id, kind, raw_value, normalized_value, archived_at)
       values ($1, $2, 'phone', '(11) 91234-0000', '+5511912340000', statement_timestamp())`,
      [clinicA, archivedMethodContact.rows[0]!.id],
    );
    expect(await searchContacts(ownerA, clinicA, "(11) 91234-0000", {
      normalizedValue: "+5511912340000",
    })).toEqual([]);
  });

  it("isola contacts, person_contacts, patients e lead_sources entre clínicas", async () => {
    const contactB = await createContact(ownerB, clinicB, "Pessoa Clínica B", [
      {
        kind: "email",
        raw_value: "pessoa.b@example.test",
        normalized_value: "pessoa.b@example.test",
        is_primary: true,
        is_whatsapp: false,
      },
    ]);
    expect(
      (await ownerB.client.rpc("link_contact_as_patient", { clinic_id: clinicB, contact_id: contactB })).error,
    ).toBeNull();
    expect(
      (await ownerB.client.rpc("create_lead_source", { clinic_id: clinicB, name: "Indicação B" })).error,
    ).toBeNull();
    for (const table of ["contacts", "person_contacts", "patients", "lead_sources"] as const) {
      const foreign = await ownerA.client.from(table).select("clinic_id").eq("clinic_id", clinicB);
      expect(foreign.error).toBeNull();
      expect(foreign.data).toEqual([]);
    }
    const crossTenant = await ownerA.client.rpc("archive_contact", {
      clinic_id: clinicB,
      contact_id: contactB,
    });
    expect(crossTenant.error).not.toBeNull();
  });

  it("deduplica telefone/e-mail ativo e permite reutilização após arquivar", async () => {
    const first = await createContact(ownerA, clinicA, "Telefone Original", [
      {
        kind: "phone",
        raw_value: "(11) 93456-7890",
        normalized_value: "+5511934567890",
        is_primary: true,
        is_whatsapp: true,
      },
    ]);
    const duplicate = await ownerA.client.rpc("create_contact", {
      clinic_id: clinicA,
      full_name: "Telefone Duplicado",
      notes: null,
      idempotency_key: crypto.randomUUID(),
      methods: [
        {
          kind: "phone",
          raw_value: "55 11 93456.7890",
          normalized_value: "+5511934567890",
          is_primary: true,
          is_whatsapp: false,
        },
      ],
      link_as_patient: false,
    });
    expect(duplicate.error?.code).toBe("23505");
    const samePhoneOtherClinic = await createContact(ownerB, clinicB, "Telefone Outra Clínica", [
      {
        kind: "phone",
        raw_value: "11934567890",
        normalized_value: "+5511934567890",
        is_primary: true,
        is_whatsapp: false,
      },
    ]);
    expect(samePhoneOtherClinic).toBeTruthy();
    await createContact(ownerA, clinicA, "E-mail Original", [
      {
        kind: "email",
        raw_value: "  Alias.Teste+crm@Example.Test  ",
        normalized_value: "alias.teste+crm@example.test",
        is_primary: true,
        is_whatsapp: false,
      },
    ]);
    const duplicateEmail = await ownerA.client.rpc("create_contact", {
      clinic_id: clinicA,
      full_name: "E-mail Duplicado",
      notes: null,
      idempotency_key: crypto.randomUUID(),
      methods: [
        {
          kind: "email",
          raw_value: "ALIAS.TESTE+CRM@example.test",
          normalized_value: "alias.teste+crm@example.test",
          is_primary: true,
          is_whatsapp: false,
        },
      ],
      link_as_patient: false,
    });
    expect(duplicateEmail.error?.code).toBe("23505");
    const method = await pool.query<{ id: string }>(
      "select id from public.person_contacts where contact_id = $1",
      [first],
    );
    expect(
      (await ownerA.client.rpc("archive_contact_method", {
        clinic_id: clinicA,
        contact_method_id: method.rows[0]!.id,
      })).error,
    ).toBeNull();
    const reused = await createContact(ownerA, clinicA, "Telefone Reutilizado", [
      {
        kind: "phone",
        raw_value: "11934567890",
        normalized_value: "+5511934567890",
        is_primary: true,
        is_whatsapp: false,
      },
    ]);
    expect(reused).not.toBe(first);
  });

  it("constraint decide corrida de mesmo meio: exatamente um insert vence", async () => {
    const [contactOne, contactTwo] = await Promise.all([
      createContact(ownerA, clinicA, "Concorrente Um"),
      createContact(ownerA, clinicA, "Concorrente Dois"),
    ]);
    const input = (contactId: string) => ownerA.client.rpc("add_contact_method", {
      clinic_id: clinicA,
      contact_id: contactId,
      kind: "email",
      raw_value: "corrida@example.test",
      normalized_value: "corrida@example.test",
      label: null,
      is_primary: true,
      is_whatsapp: false,
    });
    const results = await Promise.all([input(contactOne), input(contactTwo)]);
    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(results.filter((result) => result.error?.code === "23505")).toHaveLength(1);
  });

  it("expected_version faz apenas um update concorrente vencer", async () => {
    const contact = await createContact(ownerA, clinicA, "Versão Inicial");
    const update = (name: string) => ownerA.client.rpc("update_contact", {
      clinic_id: clinicA,
      contact_id: contact,
      full_name: name,
      notes: null,
      expected_version: 1,
    });
    const results = await Promise.all([update("Versão A"), update("Versão B")]);
    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(results.filter((result) => result.error?.code === "P4091")).toHaveLength(1);
  });

  it("set_primary concorrente nunca deixa dois principais", async () => {
    const contact = await createContact(ownerA, clinicA, "Principais Concorrentes");
    const methodIds: string[] = [];
    for (const raw of ["1134567001", "1134567002"]) {
      const method = await ownerA.client.rpc("add_contact_method", {
        clinic_id: clinicA,
        contact_id: contact,
        kind: "phone",
        raw_value: raw,
        normalized_value: `+55${raw}`,
        label: null,
        is_primary: false,
        is_whatsapp: false,
      });
      if (method.error || typeof method.data !== "string") throw method.error;
      methodIds.push(method.data);
    }
    const results = await Promise.all(
      methodIds.map((contactMethodId) => ownerA.client.rpc("set_primary_contact_method", {
        clinic_id: clinicA,
        contact_method_id: contactMethodId,
      })),
    );
    expect(results.every((result) => result.error === null)).toBe(true);
    const count = await pool.query<{ count: string }>(
      `select count(*) from public.person_contacts
       where clinic_id = $1 and contact_id = $2 and is_primary and archived_at is null`,
      [clinicA, contact],
    );
    expect(count.rows).toEqual([{ count: "1" }]);
  });

  it("add principal e archive concorrentes não entram em deadlock nem perdem dados", async () => {
    const contact = await createContact(ownerA, clinicA, "Locks Consistentes");
    const existing = await ownerA.client.rpc("add_contact_method", {
      clinic_id: clinicA,
      contact_id: contact,
      kind: "phone",
      raw_value: "1134567010",
      normalized_value: "+551134567010",
      label: null,
      is_primary: true,
      is_whatsapp: false,
    });
    if (existing.error || typeof existing.data !== "string") throw existing.error;

    const [added, archived] = await Promise.all([
      ownerA.client.rpc("add_contact_method", {
        clinic_id: clinicA,
        contact_id: contact,
        kind: "phone",
        raw_value: "1134567011",
        normalized_value: "+551134567011",
        label: null,
        is_primary: true,
        is_whatsapp: false,
      }),
      ownerA.client.rpc("archive_contact_method", {
        clinic_id: clinicA,
        contact_method_id: existing.data,
      }),
    ]);

    expect([added.error?.code, archived.error?.code]).not.toContain("40P01");
    expect(added.error).toBeNull();
    expect(archived.error).toBeNull();
    const persisted = await pool.query<{
      archived: boolean;
      is_primary: boolean;
      normalized_value: string;
    }>(
      `select archived_at is not null as archived, is_primary, normalized_value
       from public.person_contacts
       where clinic_id = $1 and contact_id = $2
       order by normalized_value`,
      [clinicA, contact],
    );
    expect(persisted.rows).toEqual([
      { archived: true, is_primary: false, normalized_value: "+551134567010" },
      { archived: false, is_primary: true, normalized_value: "+551134567011" },
    ]);
  });

  it("atualiza método com normalização consistente e não audita PII", async () => {
    const contact = await createContact(ownerA, clinicA, "Método Atualizável");
    const added = await ownerA.client.rpc("add_contact_method", {
      clinic_id: clinicA,
      contact_id: contact,
      kind: "email",
      raw_value: " Inicial@Example.Test ",
      normalized_value: "inicial@example.test",
      label: "Pessoal",
      is_primary: true,
      is_whatsapp: false,
    });
    expect(added.error).toBeNull();
    const updated = await ownerA.client.rpc("update_contact_method", {
      clinic_id: clinicA,
      contact_method_id: added.data,
      kind: "email",
      raw_value: " Novo+Alias@Example.Test ",
      normalized_value: "novo+alias@example.test",
      label: "Principal",
      is_whatsapp: false,
    });
    expect(updated.error).toBeNull();
    const audit = await pool.query<{ serialized: string }>(
      `select coalesce(before, '{}'::jsonb)::text || coalesce(after, '{}'::jsonb)::text as serialized
       from public.audit_logs where clinic_id = $1 and entity = 'person_contact'`,
      [clinicA],
    );
    expect(audit.rows.map((row) => row.serialized).join("\n")).not.toMatch(
      /example\.test|novo\+alias|inicial@/i,
    );
  });

  it("gerencia lead_sources por permissão e faz soft archive", async () => {
    const created = await managerA.client.rpc("create_lead_source", {
      clinic_id: clinicA,
      name: "Indicação Fictícia",
    });
    expect(created.error).toBeNull();
    expect(
      (await managerA.client.rpc("update_lead_source", {
        clinic_id: clinicA,
        lead_source_id: created.data,
        name: "Indicação Atualizada",
      })).error,
    ).toBeNull();
    expect(
      (await managerA.client.rpc("archive_lead_source", {
        clinic_id: clinicA,
        lead_source_id: created.data,
      })).error,
    ).toBeNull();
    expect(
      (await sdrA.client.rpc("create_lead_source", {
        clinic_id: clinicA,
        name: "Origem Proibida",
      })).error,
    ).not.toBeNull();
    const persisted = await pool.query<{ archived: boolean }>(
      "select archived_at is not null as archived from public.lead_sources where id = $1",
      [created.data],
    );
    expect(persisted.rows).toEqual([{ archived: true }]);
  });

  it("patients é extensão idempotente e unlink não remove contato", async () => {
    const contact = await createContact(receptionistA, clinicA, "Paciente Mínimo");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(
        (await receptionistA.client.rpc("link_contact_as_patient", {
          clinic_id: clinicA,
          contact_id: contact,
        })).error,
      ).toBeNull();
    }
    expect(
      (await receptionistA.client.rpc("unlink_contact_as_patient", {
        clinic_id: clinicA,
        contact_id: contact,
      })).error,
    ).toBeNull();
    const persisted = await pool.query("select id from public.contacts where id = $1", [contact]);
    expect(persisted.rowCount).toBe(1);
  });

  it("archive repetido é seguro e owner suspenso é rejeitado", async () => {
    const contact = await createContact(ownerA, clinicA, "Arquivamento Idempotente");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect(
        (await ownerA.client.rpc("archive_contact", {
          clinic_id: clinicA,
          contact_id: contact,
        })).error,
      ).toBeNull();
    }
    await pool.query(
      "update public.clinic_members set status = 'suspended' where clinic_id = $1 and user_id = $2",
      [clinicA, professionalA.id],
    );
    const assignment = await managerA.client.rpc("assign_contact_owner", {
      clinic_id: clinicA,
      contact_id: managerContact,
      owner_user_id: professionalA.id,
    });
    expect(assignment.error).not.toBeNull();
  });

  it("FKs compostas rejeitam referências cross-tenant", async () => {
    const contactA = await createContact(ownerA, clinicA, "Defesa Estrutural A");
    await expect(
      pool.query(
        `insert into public.person_contacts
           (clinic_id, contact_id, kind, raw_value, normalized_value)
         values ($1, $2, 'email', 'cross@example.test', 'cross@example.test')`,
        [clinicB, contactA],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query("insert into public.patients (clinic_id, contact_id) values ($1, $2)", [clinicB, contactA]),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query(
        "insert into public.activities (clinic_id, contact_id, type) values ($1, $2, 'fixture.cross')",
        [clinicB, contactA],
      ),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query(
        "update public.contacts set owner_user_id = $1 where clinic_id = $2 and id = $3",
        [ownerB.id, clinicA, contactA],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("membership suspensa e platform admin sem RPC dedicada não leem CRM", async () => {
    await pool.query(
      "update public.clinic_members set status = 'suspended' where clinic_id = $1 and user_id = $2",
      [clinicA, viewerA.id],
    );
    const suspended = await viewerA.client.from("contacts").select("id").eq("clinic_id", clinicA);
    const platformRead = await platformAdmin.client.from("contacts").select("id");
    expect(suspended.data).toEqual([]);
    expect(platformRead.data).toEqual([]);
  });

  it("remoção do membro preserva contato órfão: fora de own e dentro de all", async () => {
    const membership = await pool.query<{ id: string }>(
      "select id from public.clinic_members where clinic_id = $1 and user_id = $2",
      [clinicA, sdrA.id],
    );
    const removed = await ownerA.client.rpc("remove_member", {
      clinic_id: clinicA,
      member_id: membership.rows[0]!.id,
    });
    expect(removed.error).toBeNull();
    const persisted = await pool.query<{ owner_user_id: string | null }>(
      "select owner_user_id from public.contacts where id = $1",
      [sdrContact],
    );
    expect(persisted.rows).toEqual([{ owner_user_id: null }]);
    expect((await sdrA.client.from("contacts").select("id").eq("id", sdrContact)).data).toEqual([]);
    expect((await managerA.client.from("contacts").select("id").eq("id", sdrContact)).data)
      .toEqual([{ id: sdrContact }]);
    expect(
      (await managerA.client.rpc("assign_contact_owner", {
        clinic_id: clinicA,
        contact_id: sdrContact,
        owner_user_id: managerA.id,
      })).error,
    ).toBeNull();
  });
});
