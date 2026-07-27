import { EmptyState } from "@/shared/ui/empty-state";

export default function ClinicHomePage() {
  return <section className="space-y-4" aria-labelledby="home-title">
    <div><h1 id="home-title" className="text-2xl font-semibold">Início</h1><p className="mt-1 text-sm text-muted-foreground">Sua conta e o acesso seguro à clínica estão configurados.</p></div>
    <EmptyState title="Base da clínica pronta" description="Os módulos do produto serão adicionados nas próximas fases. Nenhum dado fictício de CRM é exibido aqui." />
  </section>;
}
