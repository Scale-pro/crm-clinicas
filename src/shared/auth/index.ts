import "server-only";

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
