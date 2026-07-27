import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  listPlatformClinics,
  readClinicSupportSnapshot,
} from "@/modules/platform-admin";
import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";
import { Input } from "@/shared/ui/input";
import { SupportModeBanner } from "@/shared/ui/support-mode-banner";
import {
  createSupportGrantFormAction,
  revokeSupportGrantFormAction,
} from "../../actions";

type PageProps = {
  params: Promise<{ clinicId: string }>;
  searchParams: Promise<{ error?: string; grantId?: string; status?: string }>;
};

export default async function PlatformClinicPage({ params, searchParams }: PageProps) {
  const [{ clinicId }, query, listed] = await Promise.all([
    params,
    searchParams,
    listPlatformClinics(),
  ]);
  if (!listed.ok) {
    if (listed.code === "unauthenticated") redirect("/login?next=%2Fplatform");
    if (listed.code === "mfa_required") redirect("/mfa?next=%2Fplatform");
    if (listed.code === "forbidden") notFound();
    return <ErrorState title="Suporte indisponível" description="Nenhum dado da clínica foi liberado." />;
  }
  const clinic = listed.clinics.find((item) => item.clinic_id === clinicId);
  if (!clinic) notFound();

  const grantPanel = (
    <div className="max-w-2xl space-y-4 rounded-xl border bg-background p-6">
      <div>
        <h2 className="font-semibold">Grant temporário somente leitura</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Duração fixa de uma hora. A justificativa fica registrada na auditoria.
        </p>
      </div>
      {query.error ? <p role="alert" className="text-sm text-destructive">A operação de suporte não pôde ser concluída.</p> : null}
      {query.status === "grant_revoked" ? <p role="status" className="text-sm">Grant revogado.</p> : null}
      <form action={createSupportGrantFormAction} className="space-y-3">
        <input type="hidden" name="clinicId" value={clinic.clinic_id} />
        <label className="grid gap-2 text-sm" htmlFor="reason">
          Justificativa
          <Input id="reason" name="reason" required minLength={10} maxLength={1000} />
        </label>
        <Button type="submit">Criar grant read_only</Button>
      </form>
    </div>
  );

  if (!query.grantId) {
    return (
      <section className="space-y-6" aria-labelledby="clinic-title">
        <Link className="text-sm underline underline-offset-4" href="/platform">Voltar às clínicas</Link>
        <div><h1 id="clinic-title" className="text-2xl font-semibold">{clinic.name}</h1><p className="text-sm text-muted-foreground">Status: {clinic.status}</p></div>
        {grantPanel}
      </section>
    );
  }

  const snapshot = await readClinicSupportSnapshot({
    clinicId: clinic.clinic_id,
    grantId: query.grantId,
  });
  if (!snapshot.ok) {
    if (snapshot.code === "unauthenticated") redirect("/login?next=%2Fplatform");
    if (snapshot.code === "mfa_required") redirect("/mfa?next=%2Fplatform");
    const cleanPath = `/platform/clinics/${encodeURIComponent(clinic.clinic_id)}?error=support_unavailable`;
    redirect(cleanPath);
  }

  return (
    <section className="space-y-6" aria-labelledby="clinic-title">
      <Link className="text-sm underline underline-offset-4" href="/platform">Voltar às clínicas</Link>
      <div><h1 id="clinic-title" className="text-2xl font-semibold">{clinic.name}</h1><p className="text-sm text-muted-foreground">Status: {clinic.status}</p></div>
      <SupportModeBanner clinicName={clinic.name} />
      <form action={revokeSupportGrantFormAction}>
        <input type="hidden" name="clinicId" value={clinic.clinic_id} />
        <input type="hidden" name="grantId" value={query.grantId} />
        <Button type="submit" variant="destructive">Revogar grant</Button>
      </form>

      <SupportTable title="Membros" columns={["Usuário", "Papel", "Status"]} rows={snapshot.members.map((member) => [member.user_id, member.role, member.status])} />
      <SupportTable title="Convites" columns={["E-mail", "Papel", "Status", "Expira em"]} rows={snapshot.invitations.map((invitation) => [invitation.email, invitation.role, invitation.status, invitation.expires_at])} />
      <SupportTable title="Configuração, features e limites" columns={["Tipo", "Chave", "Valor"]} rows={snapshot.configuration.map((item) => [item.kind, item.key, item.kind === "feature" ? JSON.stringify({ enabled: item.enabled, config: item.config }) : String(item.limit_value)])} />
      <SupportTable title="Auditoria" columns={["Quando", "Ação", "Entidade", "Via"]} rows={snapshot.audit.map((event) => [event.occurred_at, event.action, event.entity, event.via])} />
    </section>
  );
}

function SupportTable({ title, columns, rows }: { title: string; columns: string[]; rows: string[][] }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40"><tr>{columns.map((column) => <th className="px-4 py-3" key={column}>{column}</th>)}</tr></thead>
          <tbody>{rows.map((row, rowIndex) => <tr className="border-b last:border-0" key={`${title}-${rowIndex}`}>{row.map((cell, cellIndex) => <td className="px-4 py-3 align-top" key={`${cellIndex}-${cell}`}>{cell}</td>)}</tr>)}</tbody>
        </table>
        {rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum registro.</p> : null}
      </div>
    </section>
  );
}
