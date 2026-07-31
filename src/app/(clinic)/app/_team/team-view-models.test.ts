import { describe, expect, it } from "vitest";

import {
  INVITABLE_ROLES,
  isLastOwner,
  memberInitials,
  ownerCount,
  roleLabel,
  roleTone,
  type MemberRowView,
} from "./team-view-models";

const member = (over: Partial<MemberRowView> & { userId: string }): MemberRowView => ({
  fullName: "Ana Ribeiro",
  isCurrentUser: false,
  role: "viewer",
  ...over,
});

describe("cargos", () => {
  it("traduz os cargos reais do catálogo", () => {
    expect(roleLabel("owner")).toBe("Proprietário");
    expect(roleLabel("admin")).toBe("Administrador");
    expect(roleLabel("manager")).toBe("Gestor");
    expect(roleLabel("sdr")).toBe("Pré-vendas");
    expect(roleLabel("receptionist")).toBe("Recepção");
    expect(roleLabel("professional")).toBe("Profissional");
    expect(roleLabel("viewer")).toBe("Somente leitura");
  });

  it("cargo desconhecido não vira proprietário por acidente", () => {
    const unknown = roleLabel("superusuario");
    expect(unknown).toBe("Cargo não reconhecido");
    expect(unknown).not.toContain("superusuario");
    expect(roleTone("superusuario")).toBe("neutral");
  });

  it("o convite não oferece o cargo de proprietário", () => {
    const values = INVITABLE_ROLES.map((role) => role.value);
    expect(values).not.toContain("owner");
    // Todos os cargos oferecidos têm rótulo próprio.
    for (const role of INVITABLE_ROLES) {
      expect(role.label).toBe(roleLabel(role.value));
      expect(role.label).not.toBe("Cargo não reconhecido");
    }
  });
});

describe("proteção do último proprietário", () => {
  it("conta os proprietários ativos carregados", () => {
    expect(ownerCount([])).toBe(0);
    expect(ownerCount([member({ role: "owner", userId: "1" }), member({ userId: "2" })])).toBe(1);
    expect(ownerCount([
      member({ role: "owner", userId: "1" }),
      member({ role: "owner", userId: "2" }),
    ])).toBe(2);
  });

  it("identifica o último proprietário", () => {
    const owner = member({ role: "owner", userId: "1" });
    const viewer = member({ userId: "2" });
    expect(isLastOwner(owner, [owner, viewer])).toBe(true);

    const second = member({ role: "owner", userId: "3" });
    expect(isLastOwner(owner, [owner, second, viewer])).toBe(false);
    // Quem não é proprietário nunca é "o último proprietário".
    expect(isLastOwner(viewer, [owner, viewer])).toBe(false);
  });
});

describe("iniciais do membro", () => {
  it("usa o primeiro e o último nome", () => {
    expect(memberInitials("Ana Ribeiro")).toBe("AR");
    expect(memberInitials("Ana Paula Ribeiro Souza")).toBe("AS");
    expect(memberInitials("Ana")).toBe("A");
  });

  it("nome vazio não quebra a tela", () => {
    expect(memberInitials("")).toBe("?");
    expect(memberInitials("   ")).toBe("?");
  });
});
