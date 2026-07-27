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
  ACTIVE_CLINIC_COOKIE_NAME,
  canSelectClinic,
  resolveClinicSelection,
  signActiveClinicValue,
  verifyActiveClinicValue,
} from "./active-clinic-cookie";
export type { ClinicChoice, ClinicSelection } from "./active-clinic-cookie";
export {
  activeClinicCookieOptions,
  clearActiveClinicCookie,
  listCurrentUserClinics,
  resolveActiveClinicContext,
  selectActiveClinic,
} from "./active-clinic";
export type { ActiveClinicContextResult } from "./active-clinic";
export { updateClinicSettings } from "./clinic-settings";
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
  createReadOnlySupportGrant,
  listPlatformClinics,
  readClinicAuditForSupport,
  readClinicConfigurationForSupport,
  readClinicInvitationsForSupport,
  readClinicMembersForSupport,
  readClinicSupportSnapshot,
  revokeReadOnlySupportGrant,
} from "./platform-support";
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
