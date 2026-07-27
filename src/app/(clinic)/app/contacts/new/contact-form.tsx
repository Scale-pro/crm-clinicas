"use client";

import { useMemo, useState } from "react";

import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { createContactFormAction } from "../actions";

export function ContactForm({
  clinicId,
  existingNames,
  idempotencyKey,
}: {
  clinicId: string;
  existingNames: readonly { id: string; name: string }[];
  idempotencyKey: string;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const similar = useMemo(() => {
    const normalized = name.trim().toLocaleLowerCase("pt-BR");
    if (normalized.length < 3) return [];
    return existingNames.filter((item) => {
      const candidate = item.name.toLocaleLowerCase("pt-BR");
      return candidate.includes(normalized) || normalized.includes(candidate);
    });
  }, [existingNames, name]);

  return (
    <form
      action={createContactFormAction}
      className="space-y-5 rounded-lg border bg-background p-5"
      onSubmit={() => setPending(true)}
    >
      <input name="clinicId" type="hidden" value={clinicId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <div className="space-y-2">
        <label htmlFor="fullName" className="text-sm font-medium">Nome completo</label>
        <Input id="fullName" name="fullName" minLength={2} maxLength={160} required value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      {similar.length ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
          <p className="font-medium">Encontramos pessoas com nome parecido.</p>
          <ul className="mt-1 list-inside list-disc">
            {similar.slice(0, 3).map((item) => <li key={item.id}>{item.name}</li>)}
          </ul>
          <p className="mt-1">Você ainda pode prosseguir se forem pessoas diferentes.</p>
        </div>
      ) : null}
      <div className="space-y-2">
        <label htmlFor="notes" className="text-sm font-medium">Notas (opcional)</label>
        <textarea id="notes" name="notes" maxLength={2000} className="min-h-24 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><label htmlFor="phone" className="text-sm font-medium">Telefone (opcional)</label><Input id="phone" name="phone" inputMode="tel" maxLength={40} /></div>
        <div className="space-y-2"><label htmlFor="email" className="text-sm font-medium">E-mail (opcional)</label><Input id="email" name="email" inputMode="email" maxLength={320} /></div>
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2"><input name="isWhatsapp" type="checkbox" /> Telefone é WhatsApp</label>
        <label className="flex items-center gap-2"><input name="linkAsPatient" type="checkbox" /> Vincular como paciente</label>
      </div>
      <Button disabled={pending} type="submit">{pending ? "Salvando…" : "Criar contato"}</Button>
    </form>
  );
}
