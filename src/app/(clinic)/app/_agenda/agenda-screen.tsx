"use client";

import { CalendarRange, List, Plus } from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";

import { formatBrlFromCents } from "@/shared/lib/currency";
import { cn } from "@/shared/lib/utils";
import { Avatar } from "@/shared/ui/avatar";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/empty-state";
import { StatusBadge, type StatusTone } from "@/shared/ui/status-badge";

import { OperationsNoticeBanner } from "../_operations/operations-feedback";
import type { AgendaWorkspaceData } from "./agenda-types";
import {
  STATUS_LABELS,
  STATUS_TONES,
  formatMinutesAsTime,
  gridBounds,
  groupByProfessional,
  isActive,
  minutesIntoDay,
  placeAppointments,
  zonedDayKey,
  zonedDayStart,
} from "./agenda-view-model";
import { AppointmentPanel } from "./appointment-panel";
import { NewAppointmentDialog } from "./new-appointment-dialog";
import { useAgendaActions } from "./use-agenda-actions";

/**
 * Altura de referência de uma hora na grade.
 *
 * "De referência", e não fixa, porque a grade é uma malha de trilhas
 * `minmax(altura, auto)`: cada faixa de 5 minutos nunca fica menor que a
 * proporção do tempo, mas pode crescer se o conteúdo do bloco pedir. A régua
 * de horas e todas as colunas compartilham as MESMAS trilhas (`subgrid`),
 * então quando uma faixa cresce ela cresce para todo mundo ao mesmo tempo — o
 * horário da régua continua alinhado com o bloco, e dois profissionais no
 * mesmo horário continuam lado a lado.
 *
 * É isso que permite cumprir a regra de nunca cortar texto: um nome longo em
 * um bloco de 30 minutos estica a faixa em vez de ser truncado. Ver
 * docs/runbooks/visual-harness.md.
 */
const HOUR_HEIGHT_REM = 5.5;

/** Granularidade das trilhas. 5 min é a menor duração que o domínio aceita. */
const SLOT_MINUTES = 5;
const SLOTS_PER_HOUR = 60 / SLOT_MINUTES;
const SLOT_HEIGHT_REM = HOUR_HEIGHT_REM / SLOTS_PER_HOUR;

/**
 * Fundo do bloco por status, derivado do MESMO mapa de tons da etiqueta
 * (`STATUS_TONES`), para que grade e badge nunca discordem. A cor é reforço:
 * o texto do status continua impresso no bloco (ADR-011).
 *
 * O tom é misturado com a superfície em vez de aplicado com alfa. O resultado
 * é a MESMA cor — alfa sobre `--surface` e mistura com `--surface` dão no
 * mesmo, porque a grade é desenhada sobre a superfície —, só que opaca. Opaco
 * importa: a linha do "agora" passa por trás dos blocos e, com fundo
 * translúcido, ela atravessava o texto e parecia um risco de cancelamento.
 *
 * A mistura usa os tokens crus (`--surface`, `--accent`), nunca os `--color-*`
 * do `@theme inline`: estes últimos são declarados só em `:root` e o navegador
 * congela o valor ali, então dentro de `.dark` continuariam entregando a cor
 * do tema claro. Os tokens crus são redeclarados em `.dark` e resolvem no tema
 * certo.
 */
const BLOCK_TONES: Readonly<Record<StatusTone, string>> = {
  neutral: "bg-surface border-border",
  accent: "bg-[color-mix(in_oklab,var(--accent)_10%,var(--surface))] border-accent/30",
  success: "bg-[color-mix(in_oklab,var(--success)_10%,var(--surface))] border-success/30",
  warning: "bg-warning-surface border-warning/40",
  danger: "bg-[color-mix(in_oklab,var(--destructive)_10%,var(--surface))] border-destructive/30",
};

/**
 * Densidade tipográfica pela duração real. Ela muda TAMANHO, nunca conteúdo:
 * em qualquer faixa o bloco mostra cliente, procedimento, intervalo, duração e
 * status. Blocos curtos apenas apertam a tipografia; se ainda assim o texto
 * não couber, quem cede é a altura da faixa — nunca o texto.
 */
function blockDensity(durationMinutes: number): "compact" | "roomy" {
  return durationMinutes < 45 ? "compact" : "roomy";
}

/** "3 agendamentos" — o que a coluna do profissional realmente ocupa no dia. */
function appointmentCountLabel(count: number): string {
  if (count === 0) return "Sem agendamentos";
  return count === 1 ? "1 agendamento" : `${count} agendamentos`;
}

/**
 * Grade do dia: uma coluna por profissional, uma linha por hora.
 *
 * Cada agendamento é um `<button>` de verdade — a grade inteira é operável por
 * teclado, sem depender de arrastar (ADR-011). A régua de horas é decorativa e
 * fica fora da ordem de foco; a informação de horário vive no rótulo acessível
 * de cada card.
 */
export function AgendaScreen({
  appointments,
  canCreateContact,
  canManage,
  contacts,
  dayKey,
  nowIso,
  procedures,
  professionals,
  timezone,
}: AgendaWorkspaceData) {
  const agenda = useAgendaActions("/app/agenda");
  /**
   * No celular a lista é o padrão: a 390px a grade mostra pouco mais de uma
   * coluna e exige rolagem lateral, enquanto a lista mostra o dia inteiro com
   * preço. A grade continua a um toque porque responde o que a lista não
   * responde — onde há buraco livre e quem está livre ao mesmo tempo que
   * outro. A partir de `lg` a grade é a única visão, e o alternador some: as
   * classes de breakpoint vencem o estado.
   */
  const [mobileView, setMobileView] = useState<"list" | "grid">("list");
  const dayStart = zonedDayStart(dayKey, timezone);
  const bounds = gridBounds(appointments, dayStart);
  const hours = Array.from(
    { length: bounds.endHour - bounds.startHour },
    (_, index) => bounds.startHour + index,
  );
  const columns = groupByProfessional(professionals, appointments);
  const gridTemplateColumns = `4rem repeat(${columns.length}, minmax(11rem, 1fr))`;
  const spanMinutes = (bounds.endHour - bounds.startHour) * 60;
  const slots = Math.max(1, spanMinutes / SLOT_MINUTES);
  const gridTemplateRows = `repeat(${slots}, minmax(${SLOT_HEIGHT_REM}rem, auto))`;

  /**
   * Cancelado sai da grade — não ocupa horário nem some da tela: vai para a
   * faixa própria no rodapé, decisão de produto já existente. A regra de quem
   * está ativo é a do modelo, não uma comparação de status repetida aqui.
   */
  const canceled = appointments
    .filter((appointment) => !isActive(appointment))
    .sort((left, right) => left.startAt.localeCompare(right.startAt));
  const scheduled = appointments
    .filter(isActive)
    .sort((left, right) => left.startAt.localeCompare(right.startAt));

  // Linha do "agora": só existe quando o dia em foco É o dia corrente da
  // clínica, e sempre no fuso dela — nunca no relógio do navegador (ADR-006).
  const nowMinutes = minutesIntoDay(nowIso, dayStart);
  const nowOffset = nowMinutes - bounds.startHour * 60;
  const showNowLine = zonedDayKey(nowIso, timezone) === dayKey
    && nowOffset >= 0
    && nowOffset <= spanMinutes;
  const nowLabel = formatMinutesAsTime(nowMinutes);
  // A linha mora numa faixa de 5 minutos; o resto vira deslocamento dentro
  // dela, para o traço cair no minuto certo mesmo com a faixa esticada.
  const nowRow = Math.min(slots, Math.floor(nowOffset / SLOT_MINUTES) + 1);
  const nowShift = `${(nowOffset % SLOT_MINUTES) / SLOT_MINUTES * SLOT_HEIGHT_REM}rem`;

  if (professionals.length === 0) {
    return <div className="space-y-3">
      <OperationsNoticeBanner notice={agenda.notice} />
      <EmptyState
        action={<Button asChild size="sm" variant="outline">
          <Link href="/app/settings/professionals">Cadastrar profissionais</Link>
        </Button>}
        description="A agenda mostra uma coluna por profissional. Cadastre ao menos um para começar a marcar atendimentos."
        title="Nenhum profissional ativo"
      />
    </div>;
  }

  return <div className="flex min-h-0 flex-1 flex-col gap-3">
    <OperationsNoticeBanner notice={agenda.notice} />

    {canManage ? <div className="flex justify-end">
      <Button onClick={agenda.openCreate} size="sm" type="button">
        <Plus aria-hidden="true" />
        Novo agendamento
      </Button>
    </div> : null}

    <div
      aria-label="Visão da agenda no celular"
      className="flex gap-1 rounded-lg border border-border bg-surface p-1 lg:hidden"
      role="group"
    >
      {([
        { key: "list", label: "Lista", icon: List },
        { key: "grid", label: "Grade", icon: CalendarRange },
      ] as const).map((option) => {
        const Icon = option.icon;
        const active = mobileView === option.key;
        return <button
          aria-pressed={active}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            active ? "bg-accent/10 text-accent-strong" : "text-muted-foreground hover:bg-muted",
          )}
          key={option.key}
          onClick={() => setMobileView(option.key)}
          type="button"
        >
          <Icon aria-hidden="true" className="size-4" />
          {option.label}
        </button>;
      })}
    </div>

    <div className={cn(
      "scroll-slim min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-surface lg:block",
      mobileView === "grid" ? "block" : "hidden",
    )}>
      <div className="min-w-[40rem]">
        {/* Cabeçalho das colunas */}
        <div
          className="sticky top-0 z-10 grid border-b border-border bg-surface"
          style={{ gridTemplateColumns }}
        >
          {/* Régua de horas: fixa na horizontal, para que o horário continue
              legível ao rolar a grade lateralmente no celular. */}
          <span className="sticky left-0 z-10 border-r border-border bg-surface" />
          {columns.map(({ professional, appointments: columnAppointments }) => <div
            className="flex min-w-0 items-start gap-2.5 border-r border-border px-3 py-2.5 last:border-r-0"
            key={professional.id}
          >
            <Avatar accent={professional.color} name={professional.name} />
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight break-words">
                {professional.name}
              </span>
              {/* A contagem fica ao lado do nome porque é a leitura que a
                  recepção faz primeiro: quem está cheio e quem está livre. */}
              <span className="mt-0.5 block text-xs leading-tight text-muted-foreground">
                {appointmentCountLabel(columnAppointments.filter(isActive).length)}
              </span>
              {professional.specialty ? <span className="block text-[0.6875rem] leading-tight text-muted-foreground break-words">
                {professional.specialty}
              </span> : null}
            </span>
          </div>)}
        </div>

        {/*
          Corpo da grade: uma malha única de faixas de 5 minutos. A régua e cada
          coluna são `subgrid` desta malha — é o que mantém tudo alinhado quando
          uma faixa estica para caber um nome longo.
        */}
        <div className="relative grid" style={{ gridTemplateColumns, gridTemplateRows }}>
          {showNowLine ? <>
            {/* A linha vem antes das colunas no DOM e sem z-index própria, logo
                passa POR TRÁS dos blocos: cruzar o texto de um atendimento o
                deixaria ilegível. Altura zero para não engordar a faixa. */}
            <div
              aria-hidden="true"
              className="pointer-events-none flex h-0 items-center"
              style={{ gridColumn: "1 / -1", gridRow: nowRow, marginTop: nowShift }}
            >
              <span className="w-16 shrink-0" />
              <span className="h-px flex-1 bg-destructive/70" />
            </div>
            {/* Rótulo e ponto acompanham a régua fixa e ficam acima dela, para
                que a hora corrente continue legível mesmo com a coluna cheia. */}
            <div
              className="pointer-events-none z-[8] flex h-0 items-center"
              style={{ gridColumn: "1 / -1", gridRow: nowRow, marginTop: nowShift }}
            >
              {/* Largura EXATA da régua (4rem): sem isso o grupo vaza sobre a
                  primeira coluna e, com a grade rolada, o rótulo cobre o texto
                  do bloco que passa por baixo. */}
              <span className="sticky left-0 flex w-16 shrink-0 items-center justify-end gap-1 overflow-hidden bg-surface pr-1.5 text-[0.625rem] font-medium tabular-nums text-destructive">
                {nowLabel}
                <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-destructive" />
              </span>
            </div>
          </> : null}

          <div
            aria-hidden="true"
            className="sticky left-0 z-[6] grid border-r border-border bg-surface"
            style={{ gridColumn: 1, gridRow: "1 / -1", gridTemplateRows: "subgrid" }}
          >
            {hours.map((hour) => <div
              className="relative border-b border-border/60 text-[0.6875rem] text-muted-foreground"
              key={hour}
              style={{ gridRow: `span ${SLOTS_PER_HOUR}` }}
            >
              <span className="absolute right-2 top-1 tabular-nums">
                {String(hour).padStart(2, "0")}:00
              </span>
            </div>)}
          </div>

          {columns.map(({ professional, appointments: columnAppointments }, columnIndex) => {
            const placed = placeAppointments(columnAppointments, dayStart, bounds);
            const gridColumn = columnIndex + 2;
            return <Fragment key={professional.id}>
              <div
                aria-hidden="true"
                className={cn(
                  "grid",
                  columnIndex === columns.length - 1 ? undefined : "border-r border-border",
                )}
                style={{ gridColumn, gridRow: "1 / -1", gridTemplateRows: "subgrid" }}
              >
                {hours.map((hour) => <div
                  className="border-b border-border/60"
                  key={hour}
                  style={{ gridRow: `span ${SLOTS_PER_HOUR}` }}
                />)}
              </div>

              <ul
                aria-label={`Agendamentos de ${professional.name}`}
                className="z-[2] grid"
                style={{ gridColumn, gridRow: "1 / -1", gridTemplateRows: "subgrid" }}
              >
                {placed.map((item) => {
                  const { appointment } = item;
                  const density = blockDensity(appointment.durationMinutes);
                  const tone = STATUS_TONES[appointment.status];
                  const name = appointment.contactName ?? "Cliente";
                  // De fração da grade para faixas: a conta de posição continua
                  // sendo a do modelo, aqui só se troca a unidade.
                  const offsetMinutes = Math.round(item.top * spanMinutes);
                  const visibleMinutes = Math.max(
                    SLOT_MINUTES,
                    Math.round(item.height * spanMinutes),
                  );
                  const firstSlot = Math.floor(offsetMinutes / SLOT_MINUTES);
                  const slotSpan = Math.max(
                    1,
                    Math.ceil((offsetMinutes + visibleMinutes) / SLOT_MINUTES) - firstSlot,
                  );
                  return <li
                    className="min-w-0 px-1 py-px"
                    key={appointment.id}
                    // Coluna explícita: o banco proíbe sobreposição no mesmo
                    // profissional, mas se um dia dois blocos caírem na mesma
                    // faixa é melhor empilhar do que a colocação automática
                    // abrir uma coluna nova e vazar da grade.
                    style={{ gridColumn: 1, gridRow: `${firstSlot + 1} / span ${slotSpan}` }}
                  >
                    <button
                      aria-label={`${item.timeLabel} às ${item.endLabel}, ${appointment.durationMinutes} minutos, ${name}, ${appointment.procedureName}, ${STATUS_LABELS[appointment.status]}`}
                      className={cn(
                        "flex size-full flex-col justify-between rounded-md border text-left transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                        density === "compact" ? "gap-0.5 px-1.5 py-1" : "gap-1 px-2 py-1.5",
                        BLOCK_TONES[tone],
                      )}
                      onClick={() => agenda.select(appointment)}
                      type="button"
                    >
                      {/* Cliente e procedimento QUEBRAM linha; nunca são
                          cortados. Se o texto não couber na proporção da
                          duração, a faixa da grade é que estica. */}
                      <span aria-hidden="true" className="min-w-0">
                        <span className={cn(
                          "block font-medium leading-tight break-words",
                          density === "compact" ? "text-xs" : "text-sm",
                        )}>
                          {name}
                        </span>
                        <span className={cn(
                          "block leading-tight text-muted-foreground break-words",
                          density === "compact" ? "text-[0.6875rem]" : "text-xs",
                        )}>
                          {appointment.procedureName}
                        </span>
                      </span>

                      {/* Rodapé: intervalo + duração escrita, e o status sempre
                          na mesma âncora à direita. Ler a coluna é varrer uma
                          linha vertical fixa, não caçar a etiqueta. */}
                      <span aria-hidden="true" className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-0.5">
                        <span className={cn(
                          "font-medium tabular-nums leading-tight text-muted-foreground",
                          density === "compact" ? "text-[0.625rem]" : "text-[0.6875rem]",
                        )}>
                          {item.timeLabel}–{item.endLabel} · {appointment.durationMinutes}′
                        </span>
                        <StatusBadge
                          dot
                          tone={tone}
                          variant={density === "compact" ? "inline" : "pill"}
                          wrap
                        >
                          {STATUS_LABELS[appointment.status]}
                        </StatusBadge>
                      </span>
                    </button>
                  </li>;
                })}
              </ul>
            </Fragment>;
          })}
        </div>
      </div>
    </div>

    {/* Lista equivalente: a grade é visual, mas o dia inteiro continua legível
        em ordem cronológica no celular e por leitor de tela. */}
    <section
      aria-label="Agendamentos do dia em lista"
      className={cn("lg:hidden", mobileView === "list" ? "block" : "hidden")}
    >
      {scheduled.length === 0
        ? <EmptyState
          description={canceled.length === 0
            ? "Nenhum atendimento marcado para este dia."
            : "Nenhum atendimento em pé para este dia."}
          title="Dia livre"
        />
        : <ul className="space-y-2">
          {scheduled.map((appointment) => <li key={appointment.id}>
            <button
              className="flex w-full items-start gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() => agenda.select(appointment)}
              type="button"
            >
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {formatMinutesAsTime(minutesIntoDay(appointment.startAt, dayStart))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium break-words">
                  {appointment.contactName ?? "Cliente"}
                </span>
                <span className="block text-xs text-muted-foreground break-words">
                  {appointment.procedureName} · {appointment.professionalName}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusBadge dot tone={STATUS_TONES[appointment.status]} wrap>
                    {STATUS_LABELS[appointment.status]}
                  </StatusBadge>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {appointment.durationMinutes}′ · {formatBrlFromCents(appointment.priceCents)}
                  </span>
                </span>
              </span>
            </button>
          </li>)}
        </ul>}
    </section>

    {/*
      Faixa de cancelados: fora da grade porque cancelado não ocupa horário,
      mas visível porque a recepção precisa saber que o horário vagou.
    */}
    {canceled.length > 0 ? <section
      aria-label="Cancelados hoje"
      className="rounded-lg border border-dashed border-border bg-surface-subtle p-3"
    >
      <h2 className="text-xs font-medium text-muted-foreground">
        Cancelados hoje — não ocupam horário
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {canceled.map((appointment) => <li className="max-w-full" key={appointment.id}>
          <button
            className="flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-border bg-muted px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            onClick={() => agenda.select(appointment)}
            type="button"
          >
            <span className="tabular-nums text-muted-foreground">
              {formatMinutesAsTime(minutesIntoDay(appointment.startAt, dayStart))}
            </span>
            {/* O risco no nome reforça o cancelamento; quem não vê o traço lê
                o título da faixa e o status na etiqueta ao lado. */}
            <span className="font-medium line-through break-words">
              {appointment.contactName ?? "Cliente"}
            </span>
            <span className="text-muted-foreground break-words">
              {appointment.procedureName} · {appointment.professionalName}
            </span>
            <StatusBadge dot tone={STATUS_TONES[appointment.status]} wrap>
              {STATUS_LABELS[appointment.status]}
            </StatusBadge>
          </button>
        </li>)}
      </ul>
    </section> : null}

    {scheduled.length === 0 ? <div className="hidden lg:block">
      <EmptyState
        action={canManage
          ? <Button onClick={agenda.openCreate} size="sm" type="button">
            <Plus aria-hidden="true" />
            Novo agendamento
          </Button>
          : undefined}
        description={canceled.length === 0
          ? "Nenhum atendimento marcado para este dia."
          : "Nenhum atendimento em pé para este dia."}
        title="Dia livre"
      />
    </div> : null}

    <AppointmentPanel
      appointment={agenda.selected}
      canManage={canManage}
      onChangeStatus={agenda.changeStatus}
      onClose={() => agenda.select(null)}
      pending={agenda.pending}
      timezone={timezone}
    />

    {canManage ? <NewAppointmentDialog
      appointments={appointments}
      canCreateContact={canCreateContact}
      contacts={contacts}
      dayKey={dayKey}
      onClose={agenda.closeCreate}
      onSubmit={agenda.schedule}
      open={agenda.creating}
      pending={agenda.pending}
      procedures={procedures}
      professionals={professionals}
      timezone={timezone}
    /> : null}
  </div>;
}
