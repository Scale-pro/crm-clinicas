"use server";

import {
  enrollTotp,
  loginWithPassword,
  registerAccount,
  removeOwnTotpFactor,
  requestPasswordReset,
  updateOwnPassword,
  verifyTotp,
} from "@/modules/identity";
import {
  acceptClinicInvitation,
  createInitialClinic,
  inviteClinicMember,
} from "@/modules/tenancy";

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

export async function inviteMemberAction(input: unknown) {
  return inviteClinicMember(input);
}

export async function acceptInvitationAction(rawToken: unknown) {
  return acceptClinicInvitation(rawToken);
}
