import { redirect } from "next/navigation";
import { getMfaState, safeInternalRedirect } from "@/shared/auth";
import { ErrorState } from "@/shared/ui/error-state";
import { MfaChallengeForm, MfaEnrollmentForm } from "./mfa-form";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const query = await searchParams;
  const next = safeInternalRedirect(query.next, "/app");
  const state = await getMfaState();
  if (!state.ok) {
    if (state.code === "unauthenticated") redirect(`/login?next=${encodeURIComponent(`/mfa?next=${next}`)}`);
    return <ErrorState title="Não foi possível carregar a segurança da conta" description="Tente novamente em alguns instantes." />;
  }
  if (state.aal === "aal2") redirect(next);
  const factor = state.factors[0];
  return <section className="space-y-6" aria-labelledby="mfa-title">
    <div className="space-y-2"><p className="text-sm font-medium text-muted-foreground">Segurança da conta</p><h1 id="mfa-title" className="text-2xl font-semibold">Verificação em duas etapas</h1><p className="text-sm text-muted-foreground">Owners e administradores precisam confirmar AAL2 antes de acessar a clínica.</p></div>
    {query.error ? <p role="alert" className="text-sm text-destructive">O código não pôde ser validado.</p> : null}
    {state.enrollmentRequired || !factor ? <MfaEnrollmentForm next={next} /> : <MfaChallengeForm factorId={factor.id} next={next} />}
  </section>;
}
