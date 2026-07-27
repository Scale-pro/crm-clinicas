"use client";

import { useActionState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { enrollMfaFormAction, type EnrollmentState, verifyMfaFormAction } from "../actions";

export function MfaEnrollmentForm({ next }: { next: string }) {
  const initial: EnrollmentState = { status: "idle" };
  const [state, action, pending] = useActionState(enrollMfaFormAction, initial);
  if (state.status === "ready") return <div className="space-y-4">
    <p className="text-sm">Adicione a chave abaixo ao seu aplicativo autenticador e informe o código de seis dígitos.</p>
    <div className="overflow-x-auto rounded-md bg-muted p-3"><code className="text-xs" aria-label="Chave secreta TOTP">{state.secret}</code></div>
    <form action={verifyMfaFormAction} className="space-y-4">
      <input type="hidden" name="factorId" value={state.factorId} /><input type="hidden" name="next" value={next} />
      <label className="grid gap-2 text-sm" htmlFor="enrollment-code">Código do autenticador<Input id="enrollment-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
      <Button className="w-full" type="submit">Confirmar MFA</Button>
    </form>
  </div>;
  return <form action={action} className="space-y-4">
    {state.status === "error" ? <p role="alert" className="text-sm text-destructive">Não foi possível iniciar a configuração.</p> : null}
    <label className="grid gap-2 text-sm" htmlFor="friendlyName">Nome do dispositivo<Input id="friendlyName" name="friendlyName" defaultValue="Autenticador principal" required /></label>
    <Button className="w-full" type="submit" disabled={pending}>{pending ? "Preparando…" : "Configurar autenticador"}</Button>
  </form>;
}

export function MfaChallengeForm({ factorId, next }: { factorId: string; next: string }) {
  return <form action={verifyMfaFormAction} className="space-y-4">
    <input type="hidden" name="factorId" value={factorId} /><input type="hidden" name="next" value={next} />
    <label className="grid gap-2 text-sm" htmlFor="challenge-code">Código do autenticador<Input id="challenge-code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required autoFocus /></label>
    <Button className="w-full" type="submit">Verificar código</Button>
  </form>;
}
