import { redirect } from "next/navigation";

import { listCurrentUserClinics } from "@/shared/auth";
import { ClinicSelector } from "@/shared/ui/clinic-selector";
import { ErrorState } from "@/shared/ui/error-state";
import { selectClinicFormAction } from "../actions";

export default async function SelectClinicPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [result, query] = await Promise.all([listCurrentUserClinics(), searchParams]);
  if (!result.ok) {
    if (result.code === "unauthenticated") redirect("/login?next=%2Fselect-clinic");
    return <main className="mx-auto max-w-xl p-6"><ErrorState title="Não foi possível carregar suas clínicas" description="Tente novamente em alguns instantes." /></main>;
  }
  if (result.clinics.length === 0) redirect("/onboarding");
  return <main className="mx-auto flex min-h-svh max-w-xl items-center p-6"><section className="w-full space-y-6 rounded-xl border p-6" aria-labelledby="select-title">
    <div className="space-y-2"><h1 id="select-title" className="text-2xl font-semibold">Escolha a clínica de trabalho</h1><p className="text-sm text-muted-foreground">A seleção define apenas o contexto de navegação. Seu acesso será revalidado em cada requisição.</p></div>
    {query.error ? <p role="alert" className="text-sm text-destructive">Não foi possível selecionar essa clínica.</p> : null}
    <ClinicSelector action={selectClinicFormAction} clinics={result.clinics} />
  </section></main>;
}
