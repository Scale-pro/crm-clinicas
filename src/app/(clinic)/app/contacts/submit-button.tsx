"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/shared/ui/button";

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button aria-disabled={pending} disabled={pending} type="submit">
      {pending ? "Salvando…" : children}
    </Button>
  );
}
