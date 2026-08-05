"use client";

import { ArrowLeft, ArrowRight, Check, Search, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";

import { formatBrlFromCents, parseAmountToCents } from "@/shared/lib/currency";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { SidePanel } from "@/shared/ui/side-panel";

import type { AgendaContact, AgendaProcedure, AgendaProfessional } from "./agenda-types";
import {
  availableSlots,
  gridBounds,
  zonedDayStart,
  type AgendaAppointment,
} from "./agenda-view-model";

/**
 * Marcação em três passos — cliente, serviço, horário.
 *
 * A tela só monta a intenção; quem valida é a Server Action e, depois dela, a
 * RPC. O horário sai daqui como dia civil + `HH:MM` **locais**: a conversão
 * para instante UTC acontece no servidor, com o fuso da clínica, porque o
 * navegador não define o horário oficial do agendamento (ADR-006).
 */

export type SchedulePayload = {
  readonly contactId: string | null;
  readonly newContactName: string | null;
  readonly professionalId: string;
  readonly procedureId: string | null;
  readonly customProcedureName: string | null;
  readonly durationMinutes: number | null;
  readonly priceCents: number | null;
  readonly day: string;
  readonly time: string;
  readonly notes: string | null;
};

const STEPS = ["Cliente", "Serviço", "Horário"] as const;

function StepTrail({ step }: { step: number }) {
  return <ol className="flex flex-1 items-center gap-2" aria-label="Etapas da marcação">
    {STEPS.map((label, index) => {
      const position = index + 1;
      const reached = step >= position;
      return <li className="flex flex-1 items-center gap-2" key={label}>
        <span
          aria-current={step === position ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium",
            reached ? "text-accent-strong" : "text-muted-foreground",
          )}
        >
          <span className={cn(
            "grid size-5 shrink-0 place-items-center rounded-full border text-[0.625rem] font-semibold",
            reached ? "border-accent bg-accent/10 text-accent-strong" : "border-border",
          )}>
            {step > position ? <Check aria-hidden="true" className="size-3" /> : position}
          </span>
          <span className="hidden sm:inline">{label}</span>
        </span>
        {position < STEPS.length
          ? <span aria-hidden="true" className={cn("h-px flex-1", reached ? "bg-accent/40" : "bg-border")} />
          : null}
      </li>;
    })}
  </ol>;
}

export function NewAppointmentDialog({
  open,
  onClose,
  onSubmit,
  pending,
  dayKey,
  timezone,
  appointments,
  professionals,
  procedures,
  contacts,
  canCreateContact,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: SchedulePayload) => void;
  pending: boolean;
  dayKey: string;
  timezone: string;
  appointments: readonly AgendaAppointment[];
  professionals: readonly AgendaProfessional[];
  procedures: readonly AgendaProcedure[];
  contacts: readonly AgendaContact[];
  canCreateContact: boolean;
}) {
  const [step, setStep] = useState(1);
  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [newContactName, setNewContactName] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState(professionals[0]?.id ?? "");
  const [procedureId, setProcedureId] = useState<string | null>(procedures[0]?.id ?? null);
  const [customName, setCustomName] = useState("");
  const [customPrice, setCustomPrice] = useState("");
  const [customDuration, setCustomDuration] = useState("60");
  const [time, setTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const selectedProcedure = procedures.find((procedure) => procedure.id === procedureId) ?? null;
  const selectedProfessional = professionals.find((item) => item.id === professionalId) ?? null;
  const clientLabel = contactId
    ? contacts.find((contact) => contact.id === contactId)?.name ?? "Cliente selecionado"
    : newContactName ?? "";

  const customPriceCents = parseAmountToCents(customPrice);
  const customDurationMinutes = Number.parseInt(customDuration, 10);
  const customIsValid = customName.trim().length >= 2
    && customPriceCents !== null
    && Number.isInteger(customDurationMinutes)
    && customDurationMinutes >= 5
    && customDurationMinutes <= 1440;

  const durationMinutes = selectedProcedure?.durationMinutes
    ?? (customIsValid ? customDurationMinutes : 60);
  const priceCents = selectedProcedure?.priceCents ?? customPriceCents;
  const serviceLabel = selectedProcedure?.name ?? (customName.trim() || "Procedimento");
  const serviceIsReady = selectedProcedure !== null || customIsValid;

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const matches = term === ""
      ? contacts
      : contacts.filter((contact) => contact.name.toLocaleLowerCase("pt-BR").includes(term));
    return matches.slice(0, 8);
  }, [contacts, search]);

  const slots = useMemo(() => {
    const dayStart = zonedDayStart(dayKey, timezone);
    const professionalAppointments = appointments.filter(
      (appointment) => appointment.professionalId === professionalId,
    );
    return availableSlots(
      professionalAppointments,
      dayStart,
      gridBounds(professionalAppointments, dayStart),
      durationMinutes,
    );
  }, [appointments, dayKey, durationMinutes, professionalId, timezone]);

  function reset() {
    setStep(1);
    setSearch("");
    setContactId(null);
    setNewContactName(null);
    setTime(null);
    setNotes("");
  }

  function close() {
    reset();
    onClose();
  }

  function submit() {
    if (!professionalId || !time || !serviceIsReady) return;
    onSubmit({
      contactId,
      newContactName,
      professionalId,
      procedureId: selectedProcedure?.id ?? null,
      customProcedureName: selectedProcedure ? null : customName.trim(),
      durationMinutes: selectedProcedure ? null : customDurationMinutes,
      priceCents: selectedProcedure ? null : customPriceCents,
      day: dayKey,
      time,
      notes: notes.trim() === "" ? null : notes.trim(),
    });
  }

  if (!open) return null;

  return <SidePanel
    header={<div className="flex min-w-0 flex-1 items-center gap-4">
      <h2 className="shrink-0 text-base font-semibold">Novo agendamento</h2>
      <StepTrail step={step} />
    </div>}
    layout="center"
    onClose={close}
    open
    title="Novo agendamento"
    footer={<div className="flex items-center justify-between gap-3">
      <Button
        disabled={step === 1 || pending}
        onClick={() => setStep((current) => Math.max(1, current - 1))}
        type="button"
        variant="ghost"
      >
        <ArrowLeft aria-hidden="true" />
        Voltar
      </Button>

      {step < 3
        ? <Button
          disabled={step === 1 ? clientLabel === "" : !serviceIsReady || professionalId === ""}
          onClick={() => setStep((current) => Math.min(3, current + 1))}
          type="button"
        >
          {step === 1 ? "Escolher serviço" : "Escolher horário"}
          <ArrowRight aria-hidden="true" />
        </Button>
        : <Button disabled={pending || time === null} onClick={submit} type="button">
          {pending ? "Salvando…" : "Confirmar agendamento"}
        </Button>}
    </div>}
  >
    {step === 1 ? <section className="mx-auto max-w-xl space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold">Para quem é o agendamento?</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Busque um cliente já cadastrado{canCreateContact ? " ou digite um nome novo" : ""}.
        </p>
      </div>

      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus
          className="h-11 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onChange={(event) => {
            setSearch(event.target.value);
            setContactId(null);
            setNewContactName(null);
          }}
          placeholder="Nome do cliente"
          type="search"
          value={search}
        />
      </div>

      {canCreateContact && search.trim().length >= 2
        && !filteredContacts.some(
          (contact) => contact.name.toLocaleLowerCase("pt-BR") === search.trim().toLocaleLowerCase("pt-BR"),
        )
        ? <Button
          className="w-full"
          onClick={() => {
            setNewContactName(search.trim());
            setContactId(null);
            setStep(2);
          }}
          type="button"
          variant="outline"
        >
          <UserPlus aria-hidden="true" />
          Cadastrar e agendar para “{search.trim()}”
        </Button>
        : null}

      {filteredContacts.length > 0 ? <ul className="space-y-1.5">
        {filteredContacts.map((contact) => <li key={contact.id}>
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              contactId === contact.id
                ? "border-accent bg-accent/5"
                : "border-border hover:border-accent/60 hover:bg-muted",
            )}
            onClick={() => {
              setContactId(contact.id);
              setNewContactName(null);
              setStep(2);
            }}
            type="button"
          >
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold uppercase">
              {contact.name.slice(0, 2)}
            </span>
            <span className="truncate font-medium">{contact.name}</span>
          </button>
        </li>)}
      </ul> : <p className="text-center text-sm text-muted-foreground">
        {contacts.length === 0
          ? "Nenhum cliente cadastrado ainda."
          : "Nenhum cliente encontrado com esse nome."}
      </p>}
    </section> : null}

    {step === 2 ? <section className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div>
          <h3 className="text-lg font-semibold">Qual procedimento?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Duração e preço vêm do catálogo e ficam congelados neste agendamento.
          </p>
        </div>

        {procedures.length > 0 ? <ul className="grid gap-3 sm:grid-cols-2">
          {procedures.map((procedure) => <li key={procedure.id}>
            <button
              aria-pressed={procedureId === procedure.id}
              className={cn(
                "w-full rounded-lg border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                procedureId === procedure.id
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-accent/60 hover:bg-muted",
              )}
              onClick={() => {
                setProcedureId(procedure.id);
                setTime(null);
              }}
              type="button"
            >
              <span className="block font-medium">{procedure.name}</span>
              <span className="mt-0.5 block text-sm text-muted-foreground tabular-nums">
                {procedure.durationMinutes} min · {formatBrlFromCents(procedure.priceCents)}
              </span>
            </button>
          </li>)}
        </ul> : <div className="space-y-3 rounded-lg border border-dashed border-border bg-surface-subtle p-4">
          <p className="text-sm text-muted-foreground">
            Nenhum procedimento cadastrado. Informe o serviço deste atendimento:
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_8rem_8rem]">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Procedimento</span>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="Limpeza de pele"
                value={customName}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Duração (min)</span>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                inputMode="numeric"
                onChange={(event) => setCustomDuration(event.target.value)}
                value={customDuration}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Valor (R$)</span>
              <input
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                inputMode="decimal"
                onChange={(event) => setCustomPrice(event.target.value)}
                placeholder="250,00"
                value={customPrice}
              />
            </label>
          </div>
        </div>}

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Profissional</span>
          <select
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onChange={(event) => {
              setProfessionalId(event.target.value);
              setTime(null);
            }}
            value={professionalId}
          >
            {professionals.map((professional) => <option key={professional.id} value={professional.id}>
              {professional.name}
            </option>)}
          </select>
        </label>
      </div>

      <aside className="h-fit space-y-3 rounded-lg border border-border bg-surface-subtle p-4">
        <h4 className="text-sm font-semibold">Resumo</h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Cliente</dt>
            <dd className="truncate text-right font-medium">{clientLabel || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Serviço</dt>
            <dd className="truncate text-right font-medium">{serviceLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Profissional</dt>
            <dd className="truncate text-right font-medium">{selectedProfessional?.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-2">
            <dt className="text-muted-foreground">Valor</dt>
            <dd className="text-right font-semibold tabular-nums">
              {priceCents === null ? "—" : formatBrlFromCents(priceCents)}
            </dd>
          </div>
        </dl>
      </aside>
    </section> : null}

    {step === 3 ? <section className="grid gap-6 lg:grid-cols-2">
      <div>
        <h3 className="text-lg font-semibold">Escolha o horário</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Horários já ocupados de {selectedProfessional?.name ?? "profissional"} não aparecem.
          Fuso da clínica: {timezone}.
        </p>

        {slots.length > 0 ? <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {slots.map((slot) => <li key={slot}>
            <button
              aria-pressed={time === slot}
              className={cn(
                "w-full rounded-md border py-2 text-sm font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                time === slot
                  ? "border-accent bg-accent/10 text-accent-strong"
                  : "border-border hover:border-accent/60 hover:bg-muted",
              )}
              onClick={() => setTime(slot)}
              type="button"
            >
              {slot}
            </button>
          </li>)}
        </ul> : <p className="mt-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          Não há horário livre para esta duração neste dia. Escolha outro profissional,
          outro dia ou um procedimento mais curto.
        </p>}
      </div>

      <aside className="space-y-4 rounded-lg border border-border bg-surface-subtle p-4">
        <h4 className="text-sm font-semibold">Resumo do agendamento</h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Cliente</dt>
            <dd className="truncate text-right font-medium">{clientLabel || "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Serviço</dt>
            <dd className="truncate text-right font-medium">{serviceLabel}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Profissional</dt>
            <dd className="truncate text-right font-medium">{selectedProfessional?.name ?? "—"}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Horário</dt>
            <dd className="text-right font-medium tabular-nums">
              {time ? `${time} · ${durationMinutes} min` : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-border pt-2">
            <dt className="text-muted-foreground">Valor</dt>
            <dd className="text-right font-semibold tabular-nums">
              {priceCents === null ? "—" : formatBrlFromCents(priceCents)}
            </dd>
          </div>
        </dl>

        <label className="block text-sm">
          <span className="mb-1 block font-medium">Observações (opcional)</span>
          <textarea
            className="min-h-20 w-full rounded-md border border-input bg-background p-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            maxLength={2000}
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </label>
      </aside>
    </section> : null}
  </SidePanel>;
}
