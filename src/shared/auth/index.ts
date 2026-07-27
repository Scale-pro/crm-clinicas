import "server-only";

export {
  ACTIVE_CLINIC_COOKIE_NAME,
  canSelectClinic,
  resolveClinicSelection,
  signActiveClinicValue,
  verifyActiveClinicValue,
} from "./active-clinic-cookie";
export type { ClinicChoice, ClinicSelection } from "./active-clinic-cookie";
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
