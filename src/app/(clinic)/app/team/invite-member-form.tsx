"use client";

import { useActionState } from "react";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { inviteMemberFormAction, type InviteMemberState } from "../../actions";

export function InviteMemberForm({ clinicId }: { clinicId: string }) {
  const initial: InviteMemberState = { status: "idle" };
  const [state, action, pending] = useActionState(inviteMemberFormAction, initial);
  return <form action={action} className="max-w-xl space-y-4 rounded-xl border bg-background p-6">
    <input type="hidden" name="clinicId" value={clinicId} />
    {state.status === "error" ? <p role="alert" className="text-sm text-destructive">{state.message}</p> : null}
    {state.status === "created" ? <div role="status" className="space-y-2 rounded-md bg-muted p-3 text-sm"><p>Convite criado. Compartilhe o link por um canal seguro; ele será exibido somente agora.</p><output className="block break-all font-mono text-xs">{state.link}</output></div> : null}
    <label className="grid gap-2 text-sm" htmlFor="member-email">E-mail do membro<Input id="member-email" name="email" type="email" autoComplete="email" required /></label>
    <label className="grid gap-2 text-sm" htmlFor="member-role">Papel<select id="member-role" name="role" defaultValue="receptionist" className="h-9 rounded-md border bg-background px-3 text-sm"><option value="admin">Administrador</option><option value="manager">Gerente</option><option value="sdr">SDR</option><option value="receptionist">Recepção</option><option value="professional">Profissional</option><option value="viewer">Visualização</option></select></label>
    <Button type="submit" disabled={pending}>{pending ? "Criando…" : "Criar convite"}</Button>
  </form>;
}
