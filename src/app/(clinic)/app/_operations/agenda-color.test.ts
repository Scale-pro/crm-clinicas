import { describe, expect, it } from "vitest";

import {
  BACKEND_HEX_PATTERN,
  DEFAULT_AGENDA_COLOR_HEX,
  agendaColorFromHex,
  agendaColorToHex,
  agendaColorTokens,
  isKnownAgendaColorHex,
} from "./agenda-color";
import { AGENDA_COLORS, DEFAULT_AGENDA_COLOR_TOKEN } from "./operations-view-models";

describe("adaptação de cor entre interface e backend", () => {
  it("todo token da paleta tem hexadecimal próprio no formato aceito pelo backend", () => {
    const hexes = AGENDA_COLORS.map((color) => agendaColorToHex(color.token));
    for (const hex of hexes) expect(hex).toMatch(BACKEND_HEX_PATTERN);
    // Nenhuma cor repetida: a ida e a volta são inequívocas.
    expect(new Set(hexes).size).toBe(AGENDA_COLORS.length);
    expect(agendaColorTokens()).toEqual(AGENDA_COLORS.map((color) => color.token));
  });

  it("token → hexadecimal → token devolve o mesmo token", () => {
    for (const color of AGENDA_COLORS) {
      expect(agendaColorFromHex(agendaColorToHex(color.token))).toBe(color.token);
    }
  });

  it("aceita o hexadecimal em qualquer caixa e com espaços das pontas", () => {
    const hex = agendaColorToHex("verde");
    expect(agendaColorFromHex(hex.toLowerCase())).toBe("verde");
    expect(agendaColorFromHex(`  ${hex}  `)).toBe("verde");
  });

  it("cor antiga, de outra paleta ou malformada cai no token padrão", () => {
    for (const unknown of ["#123456", "#ABCDEF", "azul", "#FFF", "", "rgb(0,0,0)", "#GGGGGG"]) {
      expect(agendaColorFromHex(unknown)).toBe(DEFAULT_AGENDA_COLOR_TOKEN);
    }
    expect(agendaColorFromHex(null)).toBe(DEFAULT_AGENDA_COLOR_TOKEN);
    expect(agendaColorFromHex(undefined)).toBe(DEFAULT_AGENDA_COLOR_TOKEN);
    expect(isKnownAgendaColorHex("#123456")).toBe(false);
  });

  it("token desconhecido grava a cor padrão em vez de recusar o cadastro", () => {
    expect(agendaColorToHex("cor-que-nao-existe")).toBe(DEFAULT_AGENDA_COLOR_HEX);
    expect(agendaColorToHex("")).toBe(DEFAULT_AGENDA_COLOR_HEX);
    expect(agendaColorToHex(DEFAULT_AGENDA_COLOR_TOKEN)).toBe(DEFAULT_AGENDA_COLOR_HEX);
  });

  it("o fallback é uma cor da paleta — nunca um valor inventado", () => {
    expect(isKnownAgendaColorHex(DEFAULT_AGENDA_COLOR_HEX)).toBe(true);
    expect(agendaColorFromHex(DEFAULT_AGENDA_COLOR_HEX)).toBe(DEFAULT_AGENDA_COLOR_TOKEN);
  });
});
