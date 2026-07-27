import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { listPlatformClinics } from "@/modules/platform-admin";
import { ErrorState } from "@/shared/ui/error-state";

export default async function PlatformPage() {
  const result = await listPlatformClinics();
  if (!result.ok) {
    if (result.code === "unauthenticated") redirect("/login?next=%2Fplatform");
    if (result.code === "mfa_required") redirect("/mfa?next=%2Fplatform");
    if (result.code === "forbidden") notFound();
    return (
      <ErrorState
        title="Não foi possível carregar as clínicas"
        description="Nenhum dado de tenant foi liberado. Tente novamente."
      />
    );
  }

  return (
    <section className="space-y-6" aria-labelledby="platform-title">
      <div>
        <h1 id="platform-title" className="text-2xl font-semibold">
          Clínicas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Somente metadados da plataforma. Dados clínicos exigem grant temporário.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="px-4 py-3">Clínica</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Fuso</th>
              <th className="px-4 py-3"><span className="sr-only">Ação</span></th>
            </tr>
          </thead>
          <tbody>
            {result.clinics.map((clinic) => (
              <tr className="border-b last:border-0" key={clinic.clinic_id}>
                <td className="px-4 py-3">
                  <span className="font-medium">{clinic.name}</span>
                  <span className="block text-xs text-muted-foreground">{clinic.slug}</span>
                </td>
                <td className="px-4 py-3">{clinic.status}</td>
                <td className="px-4 py-3">{clinic.timezone}</td>
                <td className="px-4 py-3 text-right">
                  <Link className="font-medium underline underline-offset-4" href={`/platform/clinics/${clinic.clinic_id}`}>
                    Abrir suporte
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
