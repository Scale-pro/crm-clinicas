// Dados fictícios do seed de desenvolvimento. Nenhum dado real — apenas
// pessoas e serviços de exemplo para exercitar a grade de agenda (F2.3.1)
// localmente. As chaves de idempotência são fixas e literais de propósito:
// rodar o script várias vezes deve sempre encontrar (não duplicar) as
// mesmas linhas via as RPCs de criação.

export const OWNER_EMAIL = "dev-seed-owner@example.test";
export const OWNER_PASSWORD = "Local-only-test-password-123!";

export const CLINIC = {
  name: "Clínica Dev Seed",
  slug: "seed-dev-clinica",
  timezone: "America/Sao_Paulo",
};

export type ProfessionalFixture = {
  idempotencyKey: string;
  displayName: string;
  email: string;
  phone: string;
  registrationType: string | null;
  registrationNumber: string | null;
  color: string;
  specialties: string[];
  // weekday: 1=segunda ... 7=domingo (ISO-8601), minutos desde 00:00 local.
  weeklyAvailability: { weekday: number; startMinute: number; endMinute: number }[];
};

const WEEKDAYS_MON_TO_FRI = [1, 2, 3, 4, 5];

export const PROFESSIONALS: ProfessionalFixture[] = [
  {
    idempotencyKey: "c30317e7-69b6-4178-b894-b98d7cbdbee0",
    displayName: "Ana Beatriz Souza",
    email: "ana.souza@example.test",
    phone: "+5511987650101",
    registrationType: "CRM-SP",
    registrationNumber: "123456",
    color: "#2563EB",
    specialties: ["Dermatologia Clínica", "Dermatologia Estética"],
    weeklyAvailability: WEEKDAYS_MON_TO_FRI.map((weekday) => ({
      weekday,
      startMinute: 9 * 60,
      endMinute: 18 * 60,
    })),
  },
  {
    idempotencyKey: "51a802c2-67d9-4f5e-9234-db86c3355b9d",
    displayName: "Carlos Eduardo Lima",
    email: "carlos.lima@example.test",
    phone: "+5511987650102",
    registrationType: "CREFITO",
    registrationNumber: "654321",
    color: "#16A34A",
    specialties: ["Fisioterapia Dermatofuncional"],
    weeklyAvailability: WEEKDAYS_MON_TO_FRI.map((weekday) => ({
      weekday,
      startMinute: 8 * 60,
      endMinute: 17 * 60,
    })),
  },
  {
    idempotencyKey: "e1bf0a94-d998-4490-8f00-ab29484d1ef3",
    displayName: "Juliana Ferreira Costa",
    email: "juliana.costa@example.test",
    phone: "+5511987650103",
    registrationType: null,
    registrationNumber: null,
    color: "#DB2777",
    specialties: ["Estética Facial", "Estética Corporal"],
    weeklyAvailability: WEEKDAYS_MON_TO_FRI.map((weekday) => ({
      weekday,
      startMinute: 10 * 60,
      endMinute: 19 * 60,
    })),
  },
];

export type ProcedureFixture = {
  idempotencyKey: string;
  name: string;
  category: string;
  durationMinutes: number;
  basePriceCents: number;
  color: string;
  // índices em PROFESSIONALS que atendem este procedimento.
  professionalIndexes: number[];
};

export const PROCEDURES: ProcedureFixture[] = [
  {
    idempotencyKey: "5163c9b2-e6be-4ad8-a926-fb52fe4613f9",
    name: "Limpeza de Pele",
    category: "Facial",
    durationMinutes: 60,
    basePriceCents: 18_000,
    color: "#2563EB",
    professionalIndexes: [0, 2],
  },
  {
    idempotencyKey: "5345457f-e8da-439f-93d4-3d3822a9232d",
    name: "Peeling Químico",
    category: "Facial",
    durationMinutes: 45,
    basePriceCents: 25_000,
    color: "#7C3AED",
    professionalIndexes: [0, 2],
  },
  {
    idempotencyKey: "f017e598-4594-48e0-bdf7-dad689eba909",
    name: "Drenagem Linfática",
    category: "Corporal",
    durationMinutes: 60,
    basePriceCents: 15_000,
    color: "#16A34A",
    professionalIndexes: [1, 2],
  },
  {
    idempotencyKey: "80346e3d-c9f7-4156-9222-7e43210582a3",
    name: "Radiofrequência Facial",
    category: "Facial",
    durationMinutes: 30,
    basePriceCents: 22_000,
    color: "#DB2777",
    professionalIndexes: [0, 2],
  },
  {
    idempotencyKey: "a5ff57fc-40d8-4eb3-bf9c-f6701f0073ec",
    name: "Massagem Modeladora",
    category: "Corporal",
    durationMinutes: 75,
    basePriceCents: 20_000,
    color: "#EA580C",
    professionalIndexes: [1, 2],
  },
  {
    idempotencyKey: "ee8a5bae-ceb9-4155-bba7-f25da10b5480",
    name: "Botox - Aplicação",
    category: "Injetáveis",
    durationMinutes: 30,
    basePriceCents: 80_000,
    color: "#0891B2",
    professionalIndexes: [0],
  },
];

export type ContactFixture = {
  idempotencyKey: string;
  fullName: string;
  phone: string;
  email: string | null;
};

export const CONTACTS: ContactFixture[] = [
  {
    idempotencyKey: "51344853-0663-4033-8477-45212d25c7e7",
    fullName: "Fernanda Alves Ribeiro",
    phone: "+5511987660001",
    email: "fernanda.alves@example.test",
  },
  {
    idempotencyKey: "1c086a41-18b0-4efb-bf37-9a977e7f12bb",
    fullName: "Roberto Carlos Nunes",
    phone: "+5511987660002",
    email: null,
  },
  {
    idempotencyKey: "30bd047d-1340-4b3c-a89d-e7eedabcdae6",
    fullName: "Patrícia Gomes Silva",
    phone: "+5511987660003",
    email: "patricia.gomes@example.test",
  },
  {
    idempotencyKey: "fd19b252-ca45-4355-ae6b-3a0a564e3cdb",
    fullName: "Marcos Vinícius Teixeira",
    phone: "+5511987660004",
    email: null,
  },
  {
    idempotencyKey: "d90d7681-c300-4a8e-a957-0f112cf112ba",
    fullName: "Camila Rodrigues Barros",
    phone: "+5511987660005",
    email: null,
  },
  {
    idempotencyKey: "9cab0810-5a03-4835-b718-2836d1c265b3",
    fullName: "André Luiz Martins",
    phone: "+5511987660006",
    email: "andre.martins@example.test",
  },
  {
    idempotencyKey: "93823d8d-763a-41b2-8f58-04a331b455b2",
    fullName: "Beatriz Cardoso Farias",
    phone: "+5511987660007",
    email: null,
  },
  {
    idempotencyKey: "64820b95-f84d-497f-9b35-c9f3f911b592",
    fullName: "Lucas Henrique Pires",
    phone: "+5511987660008",
    email: null,
  },
  {
    idempotencyKey: "4f15af45-51d9-49b7-8397-17a58b42e748",
    fullName: "Isabela Cristina Moraes",
    phone: "+5511987660009",
    email: "isabela.moraes@example.test",
  },
];
