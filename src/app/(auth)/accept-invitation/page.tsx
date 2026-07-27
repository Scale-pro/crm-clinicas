import Link from "next/link";
import { Button } from "@/shared/ui/button";
import { acceptInvitationFormAction } from "../actions";

export default async function AcceptInvitationPage({ searchParams }: { searchParams: Promise<{ error?: string; token?: string }> }) {
  const query = await searchParams;
  return <section className="space-y-6" aria-labelledby="invite-title">
    <div className="space-y-2"><h1 id="invite-title" className="text-2xl font-semibold">Aceitar convite</h1><p className="text-sm text-muted-foreground">Entre com o mesmo e-mail que recebeu o convite antes de confirmar.</p></div>
    {query.error ? <p role="alert" className="text-sm text-destructive">Este convite não está disponível.</p> : null}
    {query.token ? <form action={acceptInvitationFormAction}><input type="hidden" name="token" value={query.token} /><Button className="w-full" type="submit">Aceitar convite</Button></form> : <p role="alert" className="text-sm text-destructive">O link do convite está incompleto.</p>}
    <Link className="text-sm underline underline-offset-4" href={`/login?next=${encodeURIComponent(query.token ? `/accept-invitation?token=${query.token}` : "/accept-invitation")}`}>Entrar primeiro</Link>
  </section>;
}
