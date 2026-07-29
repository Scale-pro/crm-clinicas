import * as React from "react";

import { cn } from "@/shared/lib/utils";

// `ComponentPropsWithRef` (mesmo padrão do `Button`) permite encaminhar `ref`
// para gestão de foco — necessário em editores que devolvem o foco ao campo.
function Input({ className, type, ...props }: React.ComponentPropsWithRef<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
