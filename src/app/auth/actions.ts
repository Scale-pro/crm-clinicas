"use server";

import {
  createInitialClinic,
  enrollTotp,
  loginWithPassword,
  registerAccount,
  removeOwnTotpFactor,
  requestPasswordReset,
  updateOwnPassword,
  verifyTotp,
} from "@/shared/auth";

export async function registerAction(input: unknown) {
  return registerAccount(input);
}

export async function createInitialClinicAction(input: unknown) {
  return createInitialClinic(input);
}

export async function loginAction(input: unknown, next?: string | null) {
  return loginWithPassword(input, next);
}

export async function requestPasswordResetAction(input: unknown) {
  return requestPasswordReset(input);
}

export async function updatePasswordAction(input: unknown) {
  return updateOwnPassword(input);
}

export async function enrollTotpAction(friendlyName: unknown) {
  return enrollTotp(friendlyName);
}

export async function verifyTotpAction(factorId: unknown, code: unknown) {
  return verifyTotp(factorId, code);
}

export async function removeTotpFactorAction(factorId: unknown) {
  return removeOwnTotpFactor(factorId);
}
