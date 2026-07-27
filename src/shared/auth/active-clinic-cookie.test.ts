import { describe, expect, it } from "vitest";

import {
  canSelectClinic,
  resolveClinicSelection,
  signActiveClinicValue,
  verifyActiveClinicValue,
  type ClinicChoice,
} from "./active-clinic-cookie";

const SECRET = "unit-test-cookie-secret-with-more-than-32-characters";
const CLINIC_A = "11111111-1111-4111-8111-111111111111";
const CLINIC_B = "22222222-2222-4222-8222-222222222222";
const clinics: ClinicChoice[] = [
  { id: CLINIC_A, name: "Clínica A", slug: "clinica-a", timezone: "America/Sao_Paulo" },
  { id: CLINIC_B, name: "Clínica B", slug: "clinica-b", timezone: "America/Recife" },
];

describe("cookie HMAC da clínica ativa", () => {
  it("aceita um valor assinado íntegro", () => {
    const value = signActiveClinicValue(CLINIC_A, SECRET);
    expect(verifyActiveClinicValue(value, SECRET)).toBe(CLINIC_A);
  });

  it("recusa assinatura produzida com outro segredo", () => {
    const value = signActiveClinicValue(CLINIC_A, `${SECRET}-different`);
    expect(verifyActiveClinicValue(value, SECRET)).toBeNull();
  });

  it("recusa valor adulterado", () => {
    const value = signActiveClinicValue(CLINIC_A, SECRET);
    expect(verifyActiveClinicValue(value.replace(CLINIC_A, CLINIC_B), SECRET)).toBeNull();
  });

  it("recusa clinic_id malformado", () => {
    expect(verifyActiveClinicValue("v1.not-a-uuid.signature", SECRET)).toBeNull();
    expect(() => signActiveClinicValue("not-a-uuid", SECRET)).toThrow();
  });
});

describe("resolução determinística da clínica ativa", () => {
  it("seleciona automaticamente a única membership", () => {
    expect(resolveClinicSelection([clinics[0]!], null)).toEqual({
      kind: "selected",
      clinic: clinics[0],
      persisted: false,
    });
  });

  it("exige escolha quando há múltiplas memberships", () => {
    expect(resolveClinicSelection(clinics, null)).toEqual({
      kind: "selection_required",
      clinics,
    });
  });

  it("retorna estado vazio sem membership", () => {
    expect(resolveClinicSelection([], CLINIC_A)).toEqual({ kind: "empty" });
  });

  it("aceita somente clínica presente na allowlist revalidada", () => {
    expect(canSelectClinic(CLINIC_A, clinics)).toBe(true);
    expect(canSelectClinic("33333333-3333-4333-8333-333333333333", clinics)).toBe(false);
    expect(canSelectClinic("invalid", clinics)).toBe(false);
  });
});
