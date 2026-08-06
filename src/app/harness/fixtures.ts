// Fixtures do harness visual — dados fictícios de conferência de layout.
// Ver docs/runbooks/visual-harness.md.
//
// Nada aqui alcança o produto: o único arquivo que importa estas fixtures é
// `page.dev.tsx`, que só é uma rota em desenvolvimento (next.config.ts). Fora
// de desenvolvimento não há rota, logo não há import, logo estas constantes
// não entram em bundle nenhum.
//
// Os casos são escolhidos para QUEBRAR layout, não para ficar bonitos:
// durações de 30/45/60/90min lado a lado, dois atendimentos no mesmo horário
// em colunas diferentes, nome e procedimento longos o bastante para estourar
// o bloco, e os seis status do enum do banco.
//
// Timezone de referência: America/Sao_Paulo (UTC-03:00, sem DST desde 2019).
// Local 08:00 => 11:00Z.
import type { AgendaProcedure, AgendaProfessional, AgendaContact } from "../(clinic)/app/_agenda/agenda-types";
import type { AgendaAppointment } from "../(clinic)/app/_agenda/agenda-view-model";

export const TIMEZONE = "America/Sao_Paulo";
export const DAY_KEY = "2026-08-06";
/** 10:20 local — coloca a linha do "agora" dentro da faixa visível da grade. */
export const NOW_ISO = "2026-08-06T13:20:00.000Z";

export const PROFESSIONALS: readonly AgendaProfessional[] = [
  { id: "p1", name: "Ana Beatriz Souza", color: "#2563EB", specialty: "Dermatologia Clínica" },
  { id: "p2", name: "Carlos Eduardo Lima", color: "#16A34A", specialty: "Fisioterapia Dermatofuncional" },
  { id: "p3", name: "Juliana Ferreira Costa", color: "#DB2777", specialty: "Estética Facial e Corporal" },
];

function appointment(
  overrides: Partial<AgendaAppointment> & Pick<AgendaAppointment, "id" | "startAt" | "durationMinutes" | "status" | "professionalId">,
): AgendaAppointment {
  const professional = PROFESSIONALS.find((item) => item.id === overrides.professionalId)!;
  return {
    contactId: `c-${overrides.id}`,
    contactName: "Cliente Exemplo",
    procedureName: "Limpeza de Pele",
    priceCents: 18_000,
    notes: null,
    version: 1,
    professionalName: professional.name,
    professionalColor: professional.color,
    ...overrides,
  };
}

/**
 * Casos que quebram layout, de propósito:
 * - 30 / 60 / 90 min lado a lado no MESMO horário (prova altura proporcional
 *   e prova duas colunas simultâneas);
 * - nome de cliente e de procedimento que estouram o bloco;
 * - os seis status do enum.
 */
export const APPOINTMENTS: readonly AgendaAppointment[] = [
  appointment({
    id: "a1", professionalId: "p1", startAt: "2026-08-06T11:00:00.000Z",
    durationMinutes: 30, status: "scheduled",
    contactName: "Fernanda Alves Ribeiro", procedureName: "Avaliação inicial", priceCents: 15_000,
  }),
  appointment({
    id: "a2", professionalId: "p2", startAt: "2026-08-06T11:00:00.000Z",
    durationMinutes: 60, status: "confirmed",
    contactName: "Roberto Carlos Nunes", procedureName: "Drenagem Linfática", priceCents: 15_000,
  }),
  appointment({
    id: "a3", professionalId: "p3", startAt: "2026-08-06T11:00:00.000Z",
    durationMinutes: 90, status: "arrived",
    contactName: "Maria das Graças Albuquerque Vasconcelos Sobrinho Nogueira",
    procedureName: "Microagulhamento com protocolo de bioestimulação de colágeno",
    priceCents: 65_000,
  }),
  appointment({
    id: "a4", professionalId: "p1", startAt: "2026-08-06T12:00:00.000Z",
    durationMinutes: 60, status: "in_service",
    contactName: "Patrícia Gomes Silva", procedureName: "Peeling Químico", priceCents: 25_000,
  }),
  appointment({
    id: "a5", professionalId: "p2", startAt: "2026-08-06T13:00:00.000Z",
    durationMinutes: 45, status: "paid",
    contactName: "Marcos Vinícius Teixeira", procedureName: "Massagem Modeladora", priceCents: 20_000,
  }),
  appointment({
    id: "a6", professionalId: "p3", startAt: "2026-08-06T13:30:00.000Z",
    durationMinutes: 30, status: "canceled",
    contactName: "Camila Rodrigues Barros", procedureName: "Radiofrequência Facial", priceCents: 22_000,
  }),
  appointment({
    id: "a7", professionalId: "p1", startAt: "2026-08-06T17:00:00.000Z",
    durationMinutes: 90, status: "paid",
    contactName: "André Luiz Martins", procedureName: "Botox — aplicação full face", priceCents: 80_000,
  }),
  appointment({
    id: "a8", professionalId: "p2", startAt: "2026-08-06T18:00:00.000Z",
    durationMinutes: 30, status: "scheduled",
    contactName: "Beatriz Cardoso Farias", procedureName: "Limpeza de Pele", priceCents: 18_000,
  }),
  // 45 min correndo junto com os 60 min de `a4` (09:00–10:00): fecha o quarteto
  // 30/45/60/90 e põe dois profissionais diferentes no mesmo horário pela
  // segunda vez no dia. Começa às 09:30 porque o banco proíbe sobreposição no
  // mesmo profissional — `a3` só libera a agenda de p3 às 09:30.
  appointment({
    id: "a9", professionalId: "p3", startAt: "2026-08-06T12:30:00.000Z",
    durationMinutes: 45, status: "confirmed",
    contactName: "Ana Cláudia Monteiro de Albuquerque", procedureName: "Peeling Químico",
    priceCents: 25_000,
  }),
  // O pior caso da regra de não truncar: o nome mais longo do arquivo dentro do
  // bloco mais curto possível na grade. Se algum dia voltar a haver corte de
  // texto, é aqui que aparece primeiro.
  appointment({
    id: "a10", professionalId: "p1", startAt: "2026-08-06T19:00:00.000Z",
    durationMinutes: 30, status: "confirmed",
    contactName: "Maria das Graças Albuquerque Vasconcelos Sobrinho Nogueira",
    procedureName: "Microagulhamento com protocolo de bioestimulação de colágeno",
    priceCents: 65_000,
  }),
  // Segundo cancelado, com nome longo: a faixa inferior também não pode cortar.
  appointment({
    id: "a11", professionalId: "p2", startAt: "2026-08-06T16:30:00.000Z",
    durationMinutes: 60, status: "canceled",
    contactName: "Maria das Graças Albuquerque Vasconcelos Sobrinho Nogueira",
    procedureName: "Microagulhamento com protocolo de bioestimulação de colágeno",
    priceCents: 65_000,
  }),
];

export const PROCEDURES: readonly AgendaProcedure[] = [
  { id: "pr1", name: "Limpeza de Pele", durationMinutes: 60, priceCents: 18_000 },
  { id: "pr2", name: "Peeling Químico", durationMinutes: 45, priceCents: 25_000 },
  { id: "pr3", name: "Drenagem Linfática", durationMinutes: 60, priceCents: 15_000 },
  { id: "pr4", name: "Radiofrequência Facial", durationMinutes: 30, priceCents: 22_000 },
  { id: "pr5", name: "Massagem Modeladora", durationMinutes: 75, priceCents: 20_000 },
  { id: "pr6", name: "Botox — aplicação full face", durationMinutes: 30, priceCents: 80_000 },
];

export const CONTACTS: readonly AgendaContact[] = [
  { id: "c1", name: "Fernanda Alves Ribeiro" },
  { id: "c2", name: "Roberto Carlos Nunes" },
  { id: "c3", name: "Maria das Graças Albuquerque Vasconcelos Sobrinho Nogueira" },
  { id: "c4", name: "Patrícia Gomes Silva" },
  { id: "c5", name: "Marcos Vinícius Teixeira" },
];
