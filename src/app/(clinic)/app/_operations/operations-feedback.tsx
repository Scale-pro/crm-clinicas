"use client";

import Link from "next/link";
import { useState } from "react";

import { FeedbackBanner } from "@/shared/ui/feedback-banner";

import type { OperationsActionResult } from "./actions";
import { mfaHref, requiresMfa } from "./operations-errors";

/**
 * Estado de execução das Server Actions de operações, compartilhado pelas
 * telas de profissionais e procedimentos.
 *
 * Toda mensagem exibida vem pronta da fronteira do servidor: a tela nunca
 * inventa texto a partir de um código nem repassa detalhe técnico. Quando o que
 * falta é a verificação em duas etapas, o aviso vira um caminho de saída em vez
 * de um beco sem saída.
 */
export type OperationsNotice = {
  readonly tone: "success" | "warning" | "error";
  readonly text: string;
  /** Rota de origem, usada para voltar depois da verificação em duas etapas. */
  readonly mfaReturnTo?: string;
};

export function useOperationsAction(returnTo: string) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<OperationsNotice | null>(null);

  /**
   * Executa a ação e traduz o resultado em aviso. Devolve o resultado para que
   * a tela decida o que fazer (fechar painel, navegar) — a decisão de fluxo é
   * de quem chama, não daqui.
   */
  async function run(
    action: () => Promise<OperationsActionResult>,
    successText: string,
  ): Promise<OperationsActionResult> {
    setPending(true);
    setNotice(null);
    try {
      const result = await action();
      if (!result.ok) {
        setNotice({
          text: result.message,
          tone: "error",
          ...(requiresMfa(result.code) ? { mfaReturnTo: returnTo } : {}),
        });
        return result;
      }
      setNotice(result.warning
        ? { text: `${successText} ${result.warning}`, tone: "warning" }
        : { text: successText, tone: "success" });
      return result;
    } finally {
      setPending(false);
    }
  }

  return { clearNotice: () => setNotice(null), notice, pending, run };
}

export function OperationsNoticeBanner({ notice }: { notice: OperationsNotice | null }) {
  if (!notice) return null;
  return <FeedbackBanner tone={notice.tone}>
    {notice.text}
    {notice.mfaReturnTo ? <>
      {" "}
      <Link className="underline underline-offset-4" href={mfaHref(notice.mfaReturnTo)}>
        Verificar agora
      </Link>.
    </> : null}
  </FeedbackBanner>;
}
