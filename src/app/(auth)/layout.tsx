import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-lg items-center px-4 py-10 sm:px-6">
      <div className="w-full rounded-xl border bg-background p-6 shadow-sm sm:p-8">
        {children}
      </div>
    </main>
  );
}
