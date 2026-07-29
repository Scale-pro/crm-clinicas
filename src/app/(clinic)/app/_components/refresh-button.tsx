"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { actionsMenuItemClassName } from "@/shared/ui/actions-menu";

/** Recarrega os dados da rota atual no servidor, preservando os filtros. */
export function RefreshButton({ label = "Atualizar dados" }: { label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <button
    aria-busy={pending}
    className={actionsMenuItemClassName}
    onClick={() => startTransition(() => router.refresh())}
    type="button"
  >
    <RefreshCw aria-hidden="true" />
    {pending ? "Atualizando…" : label}
  </button>;
}
