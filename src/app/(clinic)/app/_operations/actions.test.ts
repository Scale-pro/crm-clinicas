import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Testes das Server Actions de operações.
 *
 * O que está sob teste é **a fronteira**: o que a interface envia, o que chega
 * aos contratos públicos de `@/modules/scheduling` e o que volta para a tela.
 * Os módulos são substituídos por dublês justamente para que a asserção seja
 * sobre o contrato — banco, RLS e MFA continuam sendo verificados pelos testes
 * de integração do backend, que são a autoridade sobre eles.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/modules/tenancy", () => ({ resolveActiveClinicContext: vi.fn() }));
vi.mock("@/modules/scheduling", () => ({
  archiveProcedure: vi.fn(),
  archiveProfessional: vi.fn(),
  archiveProfessionalProcedure: vi.fn(),
  createProcedure: vi.fn(),
  createProfessional: vi.fn(),
  getProcedure: vi.fn(),
  getProfessional: vi.fn(),
  getProfessionalWeeklyAvailability: vi.fn(),
  linkProfessionalUser: vi.fn(),
  setProfessionalProcedure: vi.fn(),
  setProfessionalSpecialties: vi.fn(),
  setProfessionalWeeklyAvailability: vi.fn(),
  unlinkProfessionalUser: vi.fn(),
  updateProcedure: vi.fn(),
  updateProfessional: vi.fn(),
}));

import * as scheduling from "@/modules/scheduling";
import { resolveActiveClinicContext } from "@/modules/tenancy";

import { agendaColorToHex } from "./agenda-color";
import {
  archiveProcedureAction,
  archiveProfessionalAction,
  createProcedureAction,
  createProfessionalAction,
  saveProcedureProfessionalLinksAction,
  setProcedureStatusAction,
  updateProcedureAction,
  updateProfessionalAction,
} from "./actions";
import { emptyWeek, type ProfessionalFormValues } from "./operations-validation";

const CLINIC_ID = "00000000-0000-4000-8000-000000000001";
const PROFESSIONAL_ID = "11111111-1111-4111-8111-111111111111";
const PROCEDURE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const LINK_ID = "44444444-4444-4444-8444-444444444444";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cada export do módulo vira um dublê já definido — sem indexação opcional. */
type SchedulingMocks = { [Key in keyof typeof scheduling]: ReturnType<typeof vi.fn> };

const mocked = scheduling as unknown as SchedulingMocks;
const clinicContext = resolveActiveClinicContext as unknown as ReturnType<typeof vi.fn>;

const professionalRecord = {
  archivedAt: null,
  color: agendaColorToHex("azul"),
  createdAt: "2026-01-01T00:00:00Z",
  displayName: "Ana Ribeiro",
  email: null,
  id: PROFESSIONAL_ID,
  notes: null,
  phone: null,
  professionalRegistrationNumber: null,
  professionalRegistrationType: null,
  specialties: [],
  status: "active",
  updatedAt: "2026-01-01T00:00:00Z",
  userId: null,
  version: 7,
};

const procedureRecord = {
  archivedAt: null,
  basePriceCents: 25_000,
  category: "Facial",
  color: agendaColorToHex("azul"),
  createdAt: "2026-01-01T00:00:00Z",
  defaultDurationMinutes: 60,
  description: null,
  id: PROCEDURE_ID,
  name: "Limpeza de pele",
  status: "active",
  updatedAt: "2026-01-01T00:00:00Z",
  version: 3,
};

function professionalInput(overrides: Partial<ProfessionalFormValues> = {}) {
  return {
    availability: emptyWeek(),
    colorToken: "verde",
    displayName: "Ana Ribeiro",
    email: "",
    linkedUserId: null,
    notes: "",
    phone: "",
    registrationNumber: "",
    registrationType: "",
    specialties: [],
    status: "active",
    ...overrides,
  };
}

function procedureInput(overrides: Record<string, unknown> = {}) {
  return {
    basePriceCents: 25_000,
    category: "Facial",
    colorToken: "azul",
    description: "",
    durationMinutes: 60,
    name: "Limpeza de pele",
    status: "active",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clinicContext.mockResolvedValue({ clinic: { id: CLINIC_ID }, status: "ready" });
  mocked.createProfessional.mockResolvedValue({ ok: true, professionalId: PROFESSIONAL_ID });
  mocked.updateProfessional.mockResolvedValue({ ok: true, version: 8 });
  mocked.getProfessional.mockResolvedValue({ ok: true, professional: professionalRecord });
  mocked.setProfessionalSpecialties.mockResolvedValue({ ok: true });
  mocked.getProfessionalWeeklyAvailability.mockResolvedValue({
    intervals: [],
    ok: true,
    timezone: "America/Sao_Paulo",
    version: 7,
  });
  mocked.setProfessionalWeeklyAvailability.mockResolvedValue({ ok: true, version: 8 });
  mocked.linkProfessionalUser.mockResolvedValue({ ok: true });
  mocked.unlinkProfessionalUser.mockResolvedValue({ ok: true });
  mocked.archiveProfessional.mockResolvedValue({ ok: true });
  mocked.createProcedure.mockResolvedValue({ ok: true, procedureId: PROCEDURE_ID });
  mocked.updateProcedure.mockResolvedValue({ ok: true, version: 4 });
  mocked.getProcedure.mockResolvedValue({ ok: true, procedure: procedureRecord });
  mocked.archiveProcedure.mockResolvedValue({ ok: true });
  mocked.setProfessionalProcedure.mockResolvedValue({ ok: true, professionalProcedureId: LINK_ID });
  mocked.archiveProfessionalProcedure.mockResolvedValue({ ok: true });
});

describe("tenant e entrada", () => {
  it("resolve a clínica no servidor e nunca aceita clinicId do navegador", async () => {
    const rejected = await createProfessionalAction({ ...professionalInput(), clinicId: CLINIC_ID });
    expect(rejected.ok).toBe(false);
    expect(mocked.createProfessional).not.toHaveBeenCalled();

    await createProfessionalAction(professionalInput());
    expect(mocked.createProfessional).toHaveBeenCalledWith(
      expect.objectContaining({ clinicId: CLINIC_ID }),
    );
  });

  it("sem clínica ativa nada é gravado", async () => {
    clinicContext.mockResolvedValue({ status: "unauthenticated" });
    const result = await createProfessionalAction(professionalInput());
    expect(result.ok).toBe(false);
    expect(mocked.createProfessional).not.toHaveBeenCalled();
    if (!result.ok) expect(result.message).toContain("clínica ativa");
  });

  it("entrada inválida não chega ao módulo", async () => {
    const result = await createProfessionalAction({ displayName: 42 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_input");
    expect(mocked.createProfessional).not.toHaveBeenCalled();
  });
});

describe("criação", () => {
  it("cria profissional com cor em hexadecimal e chave de idempotência nova", async () => {
    const result = await createProfessionalAction(professionalInput());
    expect(result.ok).toBe(true);

    const payload = mocked.createProfessional.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.color).toBe(agendaColorToHex("verde"));
    expect(payload.idempotencyKey).toMatch(UUID_PATTERN);

    await createProfessionalAction(professionalInput());
    const second = mocked.createProfessional.mock.calls[1]![0] as Record<string, unknown>;
    expect(second.idempotencyKey).not.toBe(payload.idempotencyKey);
  });

  it("campos opcionais em branco viram ausência de valor, não texto vazio", async () => {
    await createProfessionalAction(professionalInput());
    expect(mocked.createProfessional).toHaveBeenCalledWith(expect.objectContaining({
      email: null,
      notes: null,
      phone: null,
      professionalRegistrationNumber: null,
      professionalRegistrationType: null,
    }));
  });

  it("número de registro sem tipo não é enviado sozinho", async () => {
    await createProfessionalAction(professionalInput({ registrationNumber: "12345" }));
    expect(mocked.createProfessional).toHaveBeenCalledWith(expect.objectContaining({
      professionalRegistrationNumber: null,
    }));
  });

  it("cria procedimento com preço-base zero preservado", async () => {
    const result = await createProcedureAction(procedureInput({ basePriceCents: 0 }));
    expect(result.ok).toBe(true);
    const payload = mocked.createProcedure.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.basePriceCents).toBe(0);
    expect(payload.idempotencyKey).toMatch(UUID_PATTERN);
  });

  it("situação inativa escolhida no cadastro é realmente aplicada", async () => {
    await createProcedureAction(procedureInput({ status: "inactive" }));
    expect(mocked.updateProcedure).toHaveBeenCalledWith(expect.objectContaining({
      status: "inactive",
    }));
  });

  it("não chama atualização quando o cadastro já nasce na situação desejada", async () => {
    await createProcedureAction(procedureInput({ status: "active" }));
    expect(mocked.updateProcedure).not.toHaveBeenCalled();
  });
});

describe("edição e concorrência otimista", () => {
  it("envia a versão que estava em tela", async () => {
    await updateProfessionalAction({
      ...professionalInput({ displayName: "Ana Ribeiro Souza" }),
      expectedVersion: 7,
      professionalId: PROFESSIONAL_ID,
    });
    expect(mocked.updateProfessional).toHaveBeenCalledWith(expect.objectContaining({
      displayName: "Ana Ribeiro Souza",
      expectedVersion: 7,
    }));

    await updateProcedureAction({
      ...procedureInput(),
      expectedVersion: 3,
      procedureId: PROCEDURE_ID,
    });
    expect(mocked.updateProcedure).toHaveBeenCalledWith(expect.objectContaining({
      expectedVersion: 3,
    }));
  });

  it("conflito de versão vira orientação, sem detalhe técnico", async () => {
    mocked.updateProfessional.mockResolvedValue({ code: "stale_version", ok: false });
    const result = await updateProfessionalAction({
      ...professionalInput(),
      expectedVersion: 7,
      professionalId: PROFESSIONAL_ID,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("stale_version");
    expect(result.message).toContain("alterado por outra pessoa");
    expect(result.message).not.toMatch(/P4091|SQLSTATE|version/i);
    // O conflito interrompe a gravação: nada complementar é aplicado.
    expect(mocked.setProfessionalSpecialties).not.toHaveBeenCalled();
  });

  it("troca de situação relê o cadastro no servidor em vez de confiar na tela", async () => {
    await setProcedureStatusAction({ expectedVersion: 3, id: PROCEDURE_ID, status: "inactive" });
    expect(mocked.getProcedure).toHaveBeenCalled();
    expect(mocked.updateProcedure).toHaveBeenCalledWith(expect.objectContaining({
      basePriceCents: procedureRecord.basePriceCents,
      expectedVersion: 3,
      name: procedureRecord.name,
      status: "inactive",
    }));
  });
});

describe("permissão, verificação em duas etapas e registro inexistente", () => {
  it("falta de permissão devolve mensagem de permissão", async () => {
    mocked.createProfessional.mockResolvedValue({ code: "forbidden", ok: false });
    const result = await createProfessionalAction(professionalInput());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("forbidden");
    expect(result.message).toContain("permissão");
  });

  it("MFA pendente é sinalizado para que a tela ofereça a verificação", async () => {
    mocked.createProcedure.mockResolvedValue({ code: "mfa_required", ok: false });
    const result = await createProcedureAction(procedureInput());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("mfa_required");
    expect(result.message).toContain("duas etapas");
  });

  it("registro inexistente interrompe a edição antes de gravar", async () => {
    mocked.getProfessional.mockResolvedValue({ code: "professional_not_found", ok: false });
    const result = await updateProfessionalAction({
      ...professionalInput(),
      expectedVersion: 7,
      professionalId: PROFESSIONAL_ID,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("professional_not_found");
    expect(result.message).toContain("não está mais disponível");
    expect(mocked.updateProfessional).not.toHaveBeenCalled();
  });
});

describe("especialidades, disponibilidade e vínculo de usuário", () => {
  it("grava as especialidades informadas", async () => {
    await createProfessionalAction(professionalInput({ specialties: ["Peeling", "Botox"] }));
    expect(mocked.setProfessionalSpecialties).toHaveBeenCalledWith(expect.objectContaining({
      professionalId: PROFESSIONAL_ID,
      specialties: ["Peeling", "Botox"],
    }));
  });

  it("converte a semana da interface para dias ISO e minutos do dia", async () => {
    await createProfessionalAction(professionalInput({
      availability: {
        ...emptyWeek(),
        monday: { enabled: true, ranges: [{ end: "12:00", id: "a", start: "08:00" }] },
      },
    }));
    expect(mocked.setProfessionalWeeklyAvailability).toHaveBeenCalledWith(expect.objectContaining({
      expectedVersion: 7,
      intervals: [{ endMinute: 720, startMinute: 480, weekday: 1 }],
    }));
  });

  it("não regrava uma semana idêntica à que já está no servidor", async () => {
    mocked.getProfessionalWeeklyAvailability.mockResolvedValue({
      intervals: [{ endMinute: 720, id: "x", startMinute: 480, weekday: 1 }],
      ok: true,
      timezone: "America/Sao_Paulo",
      version: 7,
    });
    await createProfessionalAction(professionalInput({
      availability: {
        ...emptyWeek(),
        monday: { enabled: true, ranges: [{ end: "12:00", id: "a", start: "08:00" }] },
      },
    }));
    expect(mocked.setProfessionalWeeklyAvailability).not.toHaveBeenCalled();
  });

  it("semana inválida não é enviada e o cadastro avisa o que faltou", async () => {
    const result = await createProfessionalAction(professionalInput({
      availability: {
        ...emptyWeek(),
        monday: { enabled: true, ranges: [{ end: "07:00", id: "a", start: "08:00" }] },
      },
    }));
    expect(mocked.setProfessionalWeeklyAvailability).not.toHaveBeenCalled();
    // O profissional existe: a falha do passo complementar vira aviso, não
    // perda do cadastro.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warning).toContain("horários");
  });

  it("vincula, desvincula e não mexe no vínculo quando nada mudou", async () => {
    await createProfessionalAction(professionalInput({ linkedUserId: USER_ID }));
    expect(mocked.linkProfessionalUser).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
    }));

    vi.clearAllMocks();
    mocked.getProfessional.mockResolvedValue({
      ok: true,
      professional: { ...professionalRecord, userId: USER_ID },
    });
    mocked.updateProfessional.mockResolvedValue({ ok: true, version: 8 });
    mocked.setProfessionalSpecialties.mockResolvedValue({ ok: true });
    mocked.getProfessionalWeeklyAvailability.mockResolvedValue({
      intervals: [], ok: true, timezone: "America/Sao_Paulo", version: 8,
    });
    await updateProfessionalAction({
      ...professionalInput({ linkedUserId: null }),
      expectedVersion: 7,
      professionalId: PROFESSIONAL_ID,
    });
    expect(mocked.unlinkProfessionalUser).toHaveBeenCalled();
    expect(mocked.linkProfessionalUser).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocked.getProfessional.mockResolvedValue({
      ok: true,
      professional: { ...professionalRecord, userId: USER_ID },
    });
    mocked.updateProfessional.mockResolvedValue({ ok: true, version: 8 });
    mocked.setProfessionalSpecialties.mockResolvedValue({ ok: true });
    mocked.getProfessionalWeeklyAvailability.mockResolvedValue({
      intervals: [], ok: true, timezone: "America/Sao_Paulo", version: 8,
    });
    await updateProfessionalAction({
      ...professionalInput({ linkedUserId: USER_ID }),
      expectedVersion: 7,
      professionalId: PROFESSIONAL_ID,
    });
    expect(mocked.linkProfessionalUser).not.toHaveBeenCalled();
    expect(mocked.unlinkProfessionalUser).not.toHaveBeenCalled();
  });
});

describe("vínculos entre profissional e procedimento", () => {
  const link = (overrides: Record<string, unknown> = {}) => ({
    durationMinutesOverride: null,
    enabled: true,
    expectedVersion: null,
    priceCentsOverride: null,
    professionalId: PROFESSIONAL_ID,
    professionalProcedureId: null,
    ...overrides,
  });

  it("habilita herdando o padrão quando não há personalização", async () => {
    const result = await saveProcedureProfessionalLinksAction({
      links: [link()],
      procedureId: PROCEDURE_ID,
    });
    expect(result.ok).toBe(true);
    expect(mocked.setProfessionalProcedure).toHaveBeenCalledWith(expect.objectContaining({
      durationMinutesOverride: null,
      expectedVersion: null,
      priceCentsOverride: null,
    }));
  });

  it("preço personalizado zero é gravado como zero, não como herança", async () => {
    await saveProcedureProfessionalLinksAction({
      links: [link({ expectedVersion: 2, priceCentsOverride: 0, professionalProcedureId: LINK_ID })],
      procedureId: PROCEDURE_ID,
    });
    const payload = mocked.setProfessionalProcedure.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.priceCentsOverride).toBe(0);
    expect(payload.expectedVersion).toBe(2);
  });

  it("remover a habilitação usa o identificador do vínculo", async () => {
    await saveProcedureProfessionalLinksAction({
      links: [link({ enabled: false, expectedVersion: 2, professionalProcedureId: LINK_ID })],
      procedureId: PROCEDURE_ID,
    });
    expect(mocked.archiveProfessionalProcedure).toHaveBeenCalledWith(expect.objectContaining({
      professionalProcedureId: LINK_ID,
    }));
    expect(mocked.setProfessionalProcedure).not.toHaveBeenCalled();
  });

  it("desabilitar quem nunca esteve habilitado não chama nada", async () => {
    const result = await saveProcedureProfessionalLinksAction({
      links: [link({ enabled: false })],
      procedureId: PROCEDURE_ID,
    });
    expect(result.ok).toBe(true);
    expect(mocked.archiveProfessionalProcedure).not.toHaveBeenCalled();
  });

  it("reabilitação de um vínculo já removido é explicada, não mascarada", async () => {
    mocked.setProfessionalProcedure.mockResolvedValue({ code: "stale_version", ok: false });
    const result = await saveProcedureProfessionalLinksAction({
      links: [link()],
      procedureId: PROCEDURE_ID,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("habilitação removida");
    expect(result.message).not.toContain("Atualize a página");
  });
});

describe("arquivamento", () => {
  it("arquiva profissional e procedimento pelos contratos próprios", async () => {
    expect((await archiveProfessionalAction({ id: PROFESSIONAL_ID })).ok).toBe(true);
    expect(mocked.archiveProfessional).toHaveBeenCalledWith({
      clinicId: CLINIC_ID,
      professionalId: PROFESSIONAL_ID,
    });

    expect((await archiveProcedureAction({ id: PROCEDURE_ID })).ok).toBe(true);
    expect(mocked.archiveProcedure).toHaveBeenCalledWith({
      clinicId: CLINIC_ID,
      procedureId: PROCEDURE_ID,
    });
  });

  it("arquivar um cadastro já arquivado devolve orientação legível", async () => {
    mocked.archiveProfessional.mockResolvedValue({ code: "professional_archived", ok: false });
    const result = await archiveProfessionalAction({ id: PROFESSIONAL_ID });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain("arquivado");
    expect(result.message).not.toMatch(/P43\d\d|SQLSTATE/);
  });
});
