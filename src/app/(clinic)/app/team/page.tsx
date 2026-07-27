import { redirect } from "next/navigation";
import { resolveActiveClinicContext } from "@/shared/auth";
import { InviteMemberForm } from "./invite-member-form";

export default async function TeamPage() {
  const context = await resolveActiveClinicContext();
  if (context.status !== "ready") redirect("/app");
  return <section className="space-y-6" aria-labelledby="team-title">
    <div><h1 id="team-title" className="text-2xl font-semibold">Equipe e convites</h1><p className="mt-1 text-sm text-muted-foreground">Convites são validados no servidor, vinculados à clínica ativa e exigem AAL2.</p></div>
    <InviteMemberForm clinicId={context.clinic.id} />
  </section>;
}
