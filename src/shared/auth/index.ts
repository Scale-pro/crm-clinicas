import "server-only";

export {
  enrollTotp,
  getMfaState,
  loginWithPassword,
  removeOwnTotpFactor,
  requestPasswordReset,
  updateOwnPassword,
  verifyTotp,
} from "./account-security";
export type { LoginResult } from "./account-security";
export {
  acceptClinicInvitation,
  inviteClinicMember,
} from "./invitations";
export {
  createInitialClinic,
  registerAccount,
} from "./onboarding";
export type {
  ClinicOnboardingResult,
  RegistrationResult,
} from "./onboarding";
export {
  requireAal2,
  requireClinicAccess,
  requirePermission,
  requirePlatformAdmin,
  requireSession,
  signOutCurrentSession,
} from "./session";
export type {
  AuthGuardResult,
  GuardDenial,
  VerifiedSession,
} from "./session";
export { safeInternalRedirect } from "./safe-redirect";
