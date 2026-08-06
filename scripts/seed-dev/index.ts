#!/usr/bin/env node
// Seed de desenvolvimento — opt-in, fora de `supabase/seed.sql` (CLAUDE.md:
// seeds reais permanecem intencionalmente vazios). Cria uma clínica de
// exemplo com profissionais, procedimentos e contatos fictícios chamando
// apenas RPCs públicas autorizadas — nenhum INSERT direto em tabela de
// tenant. Uso documentado em docs/runbooks/seed-dev-data.md.
//
// Execução: pnpm seed:dev (requer a stack Supabase local ativa; ver o
// runbook para pré-requisitos e variáveis de ambiente).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/db/database.types";

import { CLINIC, CONTACTS, OWNER_EMAIL, OWNER_PASSWORD, PROCEDURES, PROFESSIONALS } from "./fixtures.ts";
import { currentTotp } from "./totp.ts";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente ausente: ${name}. Veja docs/runbooks/seed-dev-data.md.`);
  }
  return value;
}

function requireLocalUrl(name: string, rawUrl: string): URL {
  const parsed = new URL(rawUrl);
  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `${name} não aponta para a stack Supabase local (127.0.0.1/localhost). ` +
        "Este script só roda contra a stack local — abortando por segurança.",
    );
  }
  return parsed;
}

async function findUserIdByEmail(
  admin: SupabaseClient<Database>,
  email: string,
): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; page <= 25; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const found = data.users.find((user) => user.email === email);
    if (found) return found.id;
    if (data.users.length < perPage) return null;
  }
  return null;
}

async function ensureOwnerUser(admin: SupabaseClient<Database>): Promise<string> {
  const existingId = await findUserIdByEmail(admin, OWNER_EMAIL);
  if (existingId) {
    await admin.auth.admin.updateUserById(existingId, { email_confirm: true });
    return existingId;
  }
  const created = await admin.auth.admin.createUser({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("Falha ao criar o usuário dono do seed.");
  }
  return created.data.user.id;
}

async function elevateToAal2(userClient: SupabaseClient<Database>): Promise<void> {
  const existingFactors = await userClient.auth.mfa.listFactors();
  for (const factor of existingFactors.data?.all ?? []) {
    // Melhor esforço: fatores de execuções anteriores não têm segredo
    // conhecido aqui, então não dá para reverificá-los. Tenta remover para
    // não acumular fatores indefinidamente (limite local: 10 por usuário);
    // ignora falha, já que remover fator verificado pode exigir AAL2.
    await userClient.auth.mfa.unenroll({ factorId: factor.id }).catch(() => undefined);
  }

  const enrolled = await userClient.auth.mfa.enroll({ factorType: "totp" });
  if (enrolled.error || !enrolled.data || !("totp" in enrolled.data)) {
    throw enrolled.error ?? new Error("Falha ao registrar fator MFA do seed.");
  }
  const verified = await userClient.auth.mfa.challengeAndVerify({
    factorId: enrolled.data.id,
    code: currentTotp(enrolled.data.totp.secret),
  });
  if (verified.error) throw verified.error;
}

async function rpc<Name extends keyof Database["public"]["Functions"]>(
  client: SupabaseClient<Database>,
  name: Name,
  args: Database["public"]["Functions"][Name]["Args"],
): Promise<Database["public"]["Functions"][Name]["Returns"]> {
  const result = await client.rpc(name, args);
  if (result.error) {
    throw new Error(`RPC ${name} falhou: ${result.error.message}`, { cause: result.error });
  }
  return result.data as Database["public"]["Functions"][Name]["Returns"];
}

async function seedClinic(userClient: SupabaseClient<Database>): Promise<string> {
  const clinicId = await rpc(userClient, "create_clinic_with_owner", {
    clinic_name: CLINIC.name,
    clinic_slug: CLINIC.slug,
    clinic_timezone: CLINIC.timezone,
  });
  console.log(`Clínica pronta: ${CLINIC.name} (${clinicId})`);
  return clinicId as string;
}

async function seedProfessionals(
  userClient: SupabaseClient<Database>,
  clinicId: string,
): Promise<string[]> {
  const professionalIds: string[] = [];
  for (const professional of PROFESSIONALS) {
    const professionalId = (await rpc(userClient, "create_professional", {
      clinic_id: clinicId,
      display_name: professional.displayName,
      email: professional.email,
      phone: professional.phone,
      professional_registration_type: professional.registrationType,
      professional_registration_number: professional.registrationNumber,
      color: professional.color,
      notes: null,
      idempotency_key: professional.idempotencyKey,
    })) as string;
    professionalIds.push(professionalId);

    await rpc(userClient, "set_professional_specialties", {
      clinic_id: clinicId,
      professional_id: professionalId,
      specialties: professional.specialties,
    });

    const current = await userClient
      .from("professionals")
      .select("version")
      .eq("clinic_id", clinicId)
      .eq("id", professionalId)
      .single();
    if (current.error || !current.data) {
      throw new Error(`Não foi possível ler a versão do profissional ${professionalId}.`, {
        cause: current.error,
      });
    }

    await rpc(userClient, "set_professional_weekly_availability", {
      clinic_id: clinicId,
      professional_id: professionalId,
      expected_version: current.data.version,
      availability: professional.weeklyAvailability.map((slot) => ({
        weekday: slot.weekday,
        start_minute: slot.startMinute,
        end_minute: slot.endMinute,
      })),
    });

    console.log(`Profissional pronto: ${professional.displayName} (${professionalId})`);
  }
  return professionalIds;
}

async function seedProcedures(
  userClient: SupabaseClient<Database>,
  clinicId: string,
  professionalIds: string[],
): Promise<void> {
  for (const procedure of PROCEDURES) {
    const procedureId = (await rpc(userClient, "create_procedure", {
      clinic_id: clinicId,
      name: procedure.name,
      description: null,
      category: procedure.category,
      default_duration_minutes: procedure.durationMinutes,
      base_price_cents: procedure.basePriceCents,
      color: procedure.color,
      idempotency_key: procedure.idempotencyKey,
    })) as string;

    for (const professionalIndex of procedure.professionalIndexes) {
      const professionalId = professionalIds[professionalIndex];
      if (!professionalId) continue;
      await rpc(userClient, "set_professional_procedure", {
        clinic_id: clinicId,
        professional_id: professionalId,
        procedure_id: procedureId,
        duration_minutes_override: null,
        price_cents_override: null,
        expected_version: null,
      });
    }

    console.log(
      `Procedimento pronto: ${procedure.name} (${procedureId}) — ` +
        `${procedure.professionalIndexes.length} profissional(is) vinculado(s)`,
    );
  }
}

async function seedContacts(userClient: SupabaseClient<Database>, clinicId: string): Promise<void> {
  for (const contact of CONTACTS) {
    const methods = [
      { kind: "phone", raw_value: contact.phone, normalized_value: contact.phone, is_primary: true },
      ...(contact.email
        ? [{ kind: "email", raw_value: contact.email, normalized_value: contact.email, is_primary: false }]
        : []),
    ];
    const contactId = await rpc(userClient, "create_contact", {
      clinic_id: clinicId,
      full_name: contact.fullName,
      notes: null,
      idempotency_key: contact.idempotencyKey,
      methods,
      link_as_patient: false,
    });
    console.log(`Contato pronto: ${contact.fullName} (${contactId as string})`);
  }
}

async function main(): Promise<void> {
  const apiUrl = requireEnv("API_URL");
  const serviceRoleKey = requireEnv("SERVICE_ROLE_KEY");
  const publicUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const publicKey = requireEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  requireLocalUrl("API_URL", apiUrl);
  requireLocalUrl("NEXT_PUBLIC_SUPABASE_URL", publicUrl);

  // Uso de service role restrito à lista fechada (CLAUDE.md): aqui, apenas
  // para provisionar o usuário dono do seed via Auth Admin API — nenhuma
  // tabela de tenant é acessada com esta credencial.
  const admin = createClient<Database>(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await ensureOwnerUser(admin);

  const userClient = createClient<Database>(publicUrl, publicKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signedIn = await userClient.auth.signInWithPassword({
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
  });
  if (signedIn.error) throw signedIn.error;

  await elevateToAal2(userClient);

  const clinicId = await seedClinic(userClient);
  const professionalIds = await seedProfessionals(userClient, clinicId);
  await seedProcedures(userClient, clinicId, professionalIds);
  await seedContacts(userClient, clinicId);

  console.log("\nSeed de desenvolvimento concluído.");
  console.log(`Login: ${OWNER_EMAIL} / ${OWNER_PASSWORD}`);
}

main().catch((error: unknown) => {
  console.error("Seed de desenvolvimento falhou:", error);
  process.exitCode = 1;
});
