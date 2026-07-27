import Link from "next/link";

import { Button } from "@/shared/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-svh max-w-2xl flex-col items-start justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold tracking-tight">CRM Clínicas</h1>
      <p className="text-sm text-muted-foreground">
        Acesso seguro e multi-tenant para a configuração inicial da sua clínica.
      </p>
      <div className="flex flex-wrap gap-3"><Button asChild><Link href="/login">Entrar</Link></Button><Button asChild variant="outline"><Link href="/register">Criar conta</Link></Button></div>
    </main>
  );
}
