"use client";

import { RotateCcw } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { formatMinutesAsDuration } from "@/shared/lib/duration";
import { matchesTerm } from "@/shared/lib/text";
import { Button } from "@/shared/ui/button";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { DurationInput } from "@/shared/ui/duration-input";
import { EmptyState } from "@/shared/ui/empty-state";
import { Input } from "@/shared/ui/input";
import { MoneyInput } from "@/shared/ui/money-input";
import { StatusBadge } from "@/shared/ui/status-badge";

import {
  effectiveDurationMinutes,
  effectivePriceCents,
  hasAnyOverride,
  hasDurationOverride,
  hasPriceOverride,
  type ProcedureProfessionalLinkView,
} from "./operations-view-models";

/**
 * Editor do vínculo entre profissional e procedimento.
 *
 * Para cada profissional mostra o valor herdado do procedimento e, quando há
 * personalização, o valor efetivo com um indicador em texto — a herança nunca é
 * comunicada só por cor. Desabilitar um profissional já habilitado pede
 * confirmação, porque desfaz a habilitação.
 *
 * Esta entrega não calcula margem nem comissão.
 */
export function ProfessionalProcedureEditor({
  links,
  baseDurationMinutes,
  basePriceCents,
  onChange,
  disabled = false,
  headingId,
}: {
  links: readonly ProcedureProfessionalLinkView[];
  baseDurationMinutes: number;
  basePriceCents: number;
  onChange: (next: readonly ProcedureProfessionalLinkView[]) => void;
  disabled?: boolean;
  headingId?: string;
}) {
  const baseId = useId();
  const generatedHeadingId = useId();
  const titleId = headingId ?? generatedHeadingId;
  const [search, setSearch] = useState("");
  const [pendingDisable, setPendingDisable] = useState<ProcedureProfessionalLinkView | null>(null);

  const visible = useMemo(
    () => links.filter((link) => matchesTerm(search, [link.displayName, ...link.specialties])),
    [links, search],
  );
  const enabledCount = links.filter((link) => link.enabled).length;

  function patch(professionalId: string, next: Partial<ProcedureProfessionalLinkView>) {
    onChange(links.map((link) => link.professionalId === professionalId ? { ...link, ...next } : link));
  }

  if (links.length === 0) {
    return <section aria-labelledby={titleId}>
      <h3 className="sr-only" id={titleId}>Profissionais habilitados</h3>
      <EmptyState
        description="Cadastre profissionais para poder habilitá-los neste procedimento e personalizar duração e preço."
        title="Nenhum profissional cadastrado"
      />
    </section>;
  }

  return <section aria-labelledby={titleId} className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold" id={titleId}>Profissionais habilitados</h3>
        <p className="mt-0.5 text-xs text-muted-foreground" role="status">
          {enabledCount} de {links.length} profissional(is) habilitado(s) neste procedimento.
        </p>
      </div>
      <div className="min-w-0 flex-1 sm:max-w-xs">
        <label className="mb-1 block text-xs font-medium" htmlFor={`${baseId}-search`}>Buscar profissional</label>
        <Input
          id={`${baseId}-search`}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Nome ou especialidade"
          type="search"
          value={search}
        />
      </div>
    </div>

    {visible.length === 0
      ? <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground" role="status">
        Nenhum profissional corresponde à busca.
      </p>
      : <ul className="space-y-2">
        {visible.map((link) => {
          const toggleId = `${baseId}-${link.professionalId}-enabled`;
          const durationId = `${baseId}-${link.professionalId}-duration`;
          const priceId = `${baseId}-${link.professionalId}-price`;
          const duration = effectiveDurationMinutes(baseDurationMinutes, link.durationOverrideMinutes);
          const price = effectivePriceCents(basePriceCents, link.priceOverrideCents);
          return <li className="rounded-lg border border-border bg-surface" key={link.professionalId}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
              <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium" htmlFor={toggleId}>
                <input
                  checked={link.enabled}
                  className="size-4 shrink-0 accent-[var(--accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  disabled={disabled}
                  id={toggleId}
                  onChange={(event) => {
                    if (!event.target.checked && link.enabled) {
                      setPendingDisable(link);
                      return;
                    }
                    patch(link.professionalId, { enabled: true });
                  }}
                  type="checkbox"
                />
                <span className="truncate">{link.displayName}</span>
              </label>
              {link.specialties.length > 0
                ? <span className="flex flex-wrap gap-1">
                  {link.specialties.slice(0, 2).map((specialty) => <StatusBadge key={specialty}>{specialty}</StatusBadge>)}
                </span>
                : null}
              {hasAnyOverride(link)
                ? <StatusBadge tone="accent">Personalizado</StatusBadge>
                : <span className="text-xs text-muted-foreground">Usa o padrão</span>}
            </div>

            {link.enabled ? <div className="grid gap-4 border-t border-border px-3 py-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor={durationId}>Duração para este profissional</label>
                <p className="mb-1.5 text-xs text-muted-foreground" id={`${durationId}-help`}>
                  Padrão do procedimento: {formatMinutesAsDuration(baseDurationMinutes)}. Em vigor: <strong className="font-semibold text-foreground">{formatMinutesAsDuration(duration)}</strong>
                  {hasDurationOverride(link) ? " (personalizada)" : " (herdada do padrão)"}.
                </p>
                <DurationInput
                  describedBy={`${durationId}-help`}
                  disabled={disabled}
                  id={durationId}
                  onChange={(minutes) => patch(link.professionalId, { durationOverrideMinutes: minutes })}
                  valueMinutes={link.durationOverrideMinutes}
                />
                {hasDurationOverride(link) ? <Button
                  className="mt-1.5"
                  disabled={disabled}
                  onClick={() => patch(link.professionalId, { durationOverrideMinutes: null })}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <RotateCcw aria-hidden="true" />
                  Voltar à duração padrão
                </Button> : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor={priceId}>Preço para este profissional</label>
                <p className="mb-1.5 text-xs text-muted-foreground" id={`${priceId}-help`}>
                  Preço-base: {formatBrlFromCents(basePriceCents)}. Em vigor: <strong className="font-semibold text-foreground">{formatBrlFromCents(price)}</strong>
                  {hasPriceOverride(link) ? " (personalizado)" : " (herdado do padrão)"}.
                </p>
                <MoneyInput
                  describedBy={`${priceId}-help`}
                  disabled={disabled}
                  id={priceId}
                  onChange={(cents) => patch(link.professionalId, { priceOverrideCents: cents })}
                  valueCents={link.priceOverrideCents}
                />
                {hasPriceOverride(link) ? <Button
                  className="mt-1.5"
                  disabled={disabled}
                  onClick={() => patch(link.professionalId, { priceOverrideCents: null })}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <RotateCcw aria-hidden="true" />
                  Voltar ao preço-base
                </Button> : null}
              </div>
            </div> : null}
          </li>;
        })}
      </ul>}

    <ConfirmDialog
      cancelLabel="Manter habilitado"
      confirmLabel="Remover habilitação"
      description={pendingDisable
        ? `${pendingDisable.displayName} deixará de oferecer este procedimento e as personalizações de duração e preço serão descartadas.`
        : undefined}
      onCancel={() => setPendingDisable(null)}
      onConfirm={() => {
        if (pendingDisable) {
          patch(pendingDisable.professionalId, {
            durationOverrideMinutes: null,
            enabled: false,
            priceOverrideCents: null,
          });
        }
        setPendingDisable(null);
      }}
      open={pendingDisable !== null}
      title="Remover profissional deste procedimento?"
      tone="destructive"
    />
  </section>;
}
