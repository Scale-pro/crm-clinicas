"use client";

import { Button } from "@/shared/ui/button";
import { ErrorState } from "@/shared/ui/error-state";

export default function ClinicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="p-4 sm:p-5">
    <ErrorState
      title="Não foi possível carregar esta página"
      description="Tente novamente sem recarregar dados sensíveis."
      action={<Button onClick={reset}>Tentar novamente</Button>}
    />
  </div>;
}
