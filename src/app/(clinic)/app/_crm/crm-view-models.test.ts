import { describe, expect, it } from "vitest";

import { activityLabel } from "./activity-labels";
import { crmErrorMessage, mfaHref, requiresMfa } from "./crm-errors";
import {
  UNKNOWN_FIELD_LABEL,
  contactMethodDisplayValue,
  contactMethodKind,
  contactMethodKindLabel,
  opportunityStatus,
  opportunityStatusLabel,
  opportunityStatusTone,
  optionalText,
  primaryMethod,
  scopeLabel,
  sortContactMethods,
  stageEventLabel,
  type ContactMethodView,
} from "./crm-view-models";

const method = (over: Partial<ContactMethodView> = {}): ContactMethodView => ({
  displayValue: "(11) 91234-5678",
  id: "method-1",
  isPrimary: false,
  isWhatsapp: false,
  kind: "phone",
  label: null,
  rawValue: "+5511912345678",
  ...over,
});

describe("dado ausente é diferente de dado vazio", () => {
  it("`undefined` vira “—” e `null` usa o texto explícito", () => {
    expect(optionalText(undefined, "Sem responsável")).toBe(UNKNOWN_FIELD_LABEL);
    expect(optionalText(null, "Sem responsável")).toBe("Sem responsável");
    expect(optionalText("Ana Ribeiro", "Sem responsável")).toBe("Ana Ribeiro");
  });

  it("“—” nunca é confundido com um valor real", () => {
    expect(optionalText("", "Sem responsável")).toBe("");
    expect(UNKNOWN_FIELD_LABEL).not.toBe("");
  });
});

describe("meios de contato", () => {
  it("telefone em E.164 é exibido com máscara nacional", () => {
    expect(contactMethodDisplayValue("phone", "+5511912345678")).toBe("(11) 91234-5678");
    expect(contactMethodDisplayValue("phone", "+551133334444")).toBe("(11) 3333-4444");
  });

  it("e-mail e formatos fora do padrão são exibidos como vieram, sem mutilar o valor", () => {
    expect(contactMethodDisplayValue("email", "ana@clinica.example")).toBe("ana@clinica.example");
    // Mascarar às cegas descartaria o que não é dígito e mostraria outra coisa.
    expect(contactMethodDisplayValue("phone", "ramal 42")).toBe("ramal 42");
    expect(contactMethodDisplayValue("phone", "+1 415 555 0100")).toBe("+1 415 555 0100");
    expect(contactMethodDisplayValue("phone", "")).toBe("");
  });

  it("classifica os tipos conhecidos e não inventa rótulo para o desconhecido", () => {
    expect(contactMethodKind("phone")).toBe("phone");
    expect(contactMethodKind("email")).toBe("email");
    expect(contactMethodKind("instagram")).toBe("other");
    expect(contactMethodKindLabel("other")).toBe("Outro meio");
  });

  it("o principal aparece primeiro, e a ordem é estável", () => {
    const sorted = sortContactMethods([
      method({ displayValue: "(11) 3333-4444", id: "b" }),
      method({ displayValue: "(11) 91234-5678", id: "a", isPrimary: true }),
    ]);
    expect(sorted.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("o principal de um tipo cai no primeiro do tipo quando nenhum é marcado", () => {
    const methods = [method({ id: "a" }), method({ id: "b", kind: "email" })];
    expect(primaryMethod(methods, "phone")?.id).toBe("a");
    expect(primaryMethod(methods, "email")?.id).toBe("b");
    expect(primaryMethod(methods, "other")).toBeNull();
  });
});

describe("oportunidade", () => {
  it("mapeia situação e nunca deixa um status desconhecido virar “ganha”", () => {
    expect(opportunityStatus("won")).toBe("won");
    expect(opportunityStatus("lost")).toBe("lost");
    expect(opportunityStatus("open")).toBe("open");
    expect(opportunityStatus("qualquer_coisa")).toBe("open");
  });

  it("rótulo e tom acompanham a situação", () => {
    expect(opportunityStatusLabel("won")).toBe("Ganha");
    expect(opportunityStatusLabel("lost")).toBe("Perdida");
    expect(opportunityStatusLabel("open")).toBe("Aberta");
    expect(opportunityStatusTone("won")).toBe("success");
    expect(opportunityStatusTone("lost")).toBe("danger");
  });

  it("histórico resolve nomes de etapa e nunca exibe identificador cru", () => {
    const names = new Map([["stage-1", "Primeiro contato"], ["stage-2", "Proposta"]]);
    expect(stageEventLabel("stage-1", "open", names)).toBe("Primeiro contato");
    expect(stageEventLabel(null, null, names)).toBe("Criação");
    // Etapa que não está mais na pipeline não vaza o identificador.
    const removed = stageEventLabel("stage-removida", "won", names);
    expect(removed).not.toContain("stage-removida");
    expect(removed).toBe("Ganha");
    expect(stageEventLabel("stage-removida", null, names)).toBe("Etapa removida");
  });
});

describe("escopo de leitura", () => {
  it("diz explicitamente o que a pessoa está vendo", () => {
    expect(scopeLabel("all", "contatos")).toContain("toda a clínica");
    expect(scopeLabel("own", "oportunidades")).toContain("sua responsabilidade");
  });
});

describe("mensagens de erro", () => {
  it("todo código conhecido vira texto para pessoas, sem vestígio técnico", () => {
    const codes = [
      "conflict", "default_pipeline", "duplicate", "existing_open", "forbidden",
      "invalid_input", "last_active_pipeline", "mfa_required", "not_found",
      "pipeline_archived", "pipeline_has_open_opportunities", "unauthenticated",
      "unavailable", "codigo_que_nao_existe",
    ];
    for (const code of codes) {
      const message = crmErrorMessage(code);
      expect(message.length).toBeGreaterThan(20);
      expect(message).not.toMatch(/SQLSTATE|PGRST|P4\d{3}|23505|42501|constraint|rpc|supabase|select |from /i);
      expect(message).not.toContain(code);
    }
  });

  it("código desconhecido cai na mensagem genérica em vez de ser ecoado", () => {
    expect(crmErrorMessage("codigo_que_nao_existe")).toBe(crmErrorMessage("unavailable"));
  });

  it("conflito de versão orienta a recarregar, sem falar em versão interna", () => {
    const message = crmErrorMessage("conflict");
    expect(message).toContain("alterado por outra pessoa");
    expect(message).not.toMatch(/version|expected/i);
  });

  it("MFA vira caminho de saída, não beco sem saída", () => {
    expect(requiresMfa("mfa_required")).toBe(true);
    expect(requiresMfa("forbidden")).toBe(false);
    expect(mfaHref("/app/contacts/abc")).toBe("/mfa?next=%2Fapp%2Fcontacts%2Fabc");
  });
});

describe("rótulos de atividade", () => {
  it("traduz o vocabulário interno e não vaza o identificador do tipo", () => {
    expect(activityLabel("contact.created")).toBe("Contato cadastrado");
    expect(activityLabel("opportunity.stage_changed")).toBe("Oportunidade mudou de etapa");
    const unknown = activityLabel("algo.novo");
    expect(unknown).toBe("Atividade registrada");
    expect(unknown).not.toContain("algo.novo");
  });
});
