"use client";

import { useFormStatus } from "react-dom";

import { Button, type ButtonProps } from "./button";

export function SubmitButton({ children, pendingLabel = "Salvando…", ...props }: ButtonProps & {
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return <Button {...props} aria-disabled={pending} disabled={pending || props.disabled} type="submit">
    {pending ? pendingLabel : children}
  </Button>;
}
