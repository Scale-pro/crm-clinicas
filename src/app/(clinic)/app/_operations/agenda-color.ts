import { AGENDA_COLORS, DEFAULT_AGENDA_COLOR_TOKEN } from "./operations-view-models";

/**
 * Fronteira de cor entre a interface e o backend.
 *
 * A interface trabalha com **tokens** da paleta de agenda (`azul`, `verde`, …)
 * porque quem manda na aparência final é o tema — os tokens resolvem para
 * `var(--stage-N)` e acompanham claro/escuro. O backend, por decisão dele
 * (`colorSchema` em `@/modules/scheduling`), valida e guarda **hexadecimal
 * `#RRGGBB`**. Este módulo é o único ponto de tradução entre os dois; nenhuma
 * página, formulário ou Server Action converte cor por conta própria.
 *
 * O contrato do backend **não** foi alterado para acomodar a interface: a
 * adaptação acontece inteiramente aqui, na borda.
 *
 * Os hexadecimais abaixo são a conversão sRGB dos tokens `--stage-1..7`
 * definidos em `globals.css` (tema claro, a referência de impressão e de
 * exportação). São o valor de persistência; a exibição continua usando o token.
 */

const TOKEN_TO_HEX: Readonly<Record<string, string>> = {
  ambar: "#D1A542",
  azul: "#4484CF",
  "azul-claro": "#2399B2",
  laranja: "#DB753B",
  turquesa: "#37A293",
  verde: "#76AC63",
  violeta: "#A166B8",
};

/** Formato aceito pelo backend: `#RRGGBB`, sem forma curta e sem alfa. */
export const BACKEND_HEX_PATTERN = /^#[0-9A-F]{6}$/;

export const DEFAULT_AGENDA_COLOR_HEX = TOKEN_TO_HEX[DEFAULT_AGENDA_COLOR_TOKEN]!;

const HEX_TO_TOKEN = new Map(
  Object.entries(TOKEN_TO_HEX).map(([token, hex]) => [hex, token] as const),
);

/** Tokens da paleta que possuem hexadecimal de persistência. */
export function agendaColorTokens(): readonly string[] {
  return AGENDA_COLORS.map((color) => color.token);
}

/**
 * Token da interface → hexadecimal aceito pelo backend.
 *
 * Token desconhecido cai no hexadecimal da cor padrão: é preferível gravar a
 * primeira cor da paleta a recusar o cadastro por causa de um valor de
 * apresentação.
 */
export function agendaColorToHex(token: string): string {
  return TOKEN_TO_HEX[token] ?? DEFAULT_AGENDA_COLOR_HEX;
}

/**
 * Hexadecimal do backend → token da interface.
 *
 * Cores antigas, de outra paleta ou malformadas caem no token padrão. A queda é
 * deliberada e só afeta a exibição: enquanto o registro não for salvo de novo, o
 * hexadecimal original continua no banco intacto.
 */
export function agendaColorFromHex(hex: string | null | undefined): string {
  if (typeof hex !== "string") return DEFAULT_AGENDA_COLOR_TOKEN;
  const normalized = hex.trim().toUpperCase();
  if (!BACKEND_HEX_PATTERN.test(normalized)) return DEFAULT_AGENDA_COLOR_TOKEN;
  return HEX_TO_TOKEN.get(normalized) ?? DEFAULT_AGENDA_COLOR_TOKEN;
}

/** `true` quando o hexadecimal pertence à paleta atual — usado em testes e diagnósticos. */
export function isKnownAgendaColorHex(hex: string): boolean {
  return HEX_TO_TOKEN.has(hex.trim().toUpperCase());
}
