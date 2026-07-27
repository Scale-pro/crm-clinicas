import { createHmac, timingSafeEqual } from "node:crypto";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VERSION = "v1";

export const ACTIVE_CLINIC_COOKIE_NAME = "crm_active_clinic";

export type ClinicChoice = {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly timezone: string;
};

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

export function signActiveClinicValue(clinicId: string, secret: string): string {
  if (!UUID_PATTERN.test(clinicId) || secret.length < 32) {
    throw new Error("Invalid active clinic cookie input.");
  }
  const payload = `${VERSION}.${clinicId.toLowerCase()}`;
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyActiveClinicValue(
  value: string | undefined,
  secret: string,
): string | null {
  if (!value || secret.length < 32) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [version, clinicId, supplied] = parts;
  if (version !== VERSION || !clinicId || !UUID_PATTERN.test(clinicId) || !supplied) {
    return null;
  }

  const payload = `${version}.${clinicId.toLowerCase()}`;
  const expected = Buffer.from(signature(payload, secret), "utf8");
  const actual = Buffer.from(supplied, "utf8");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return clinicId.toLowerCase();
}

export type ClinicSelection =
  | { readonly kind: "empty" }
  | { readonly kind: "selection_required"; readonly clinics: readonly ClinicChoice[] }
  | { readonly kind: "selected"; readonly clinic: ClinicChoice; readonly persisted: boolean };

export function resolveClinicSelection(
  clinics: readonly ClinicChoice[],
  cookieClinicId: string | null,
): ClinicSelection {
  if (clinics.length === 0) return { kind: "empty" };
  const selected = cookieClinicId
    ? clinics.find((clinic) => clinic.id === cookieClinicId)
    : undefined;
  if (selected) return { kind: "selected", clinic: selected, persisted: true };
  if (clinics.length === 1) {
    return { kind: "selected", clinic: clinics[0]!, persisted: false };
  }
  return { kind: "selection_required", clinics };
}

export function canSelectClinic(
  clinicId: string,
  clinics: readonly ClinicChoice[],
): boolean {
  return UUID_PATTERN.test(clinicId) && clinics.some((clinic) => clinic.id === clinicId);
}
