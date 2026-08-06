"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { formatBrPhoneDigits } from "@/shared/lib/phone";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { FeedbackBanner } from "@/shared/ui/feedback-banner";
import { LoadingState } from "@/shared/ui/loading-state";
import { SidePanel } from "@/shared/ui/side-panel";
import { StatusBadge } from "@/shared/ui/status-badge";

import {
  loadWhatsAppThreadAction,
  markConversationReadAction,
  sendWhatsAppMessageAction,
  type WhatsAppThreadMessage,
} from "./actions";
import {
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_TONES,
  QUICK_REPLIES,
  conversationPreview,
} from "./whatsapp-view";

export type ConversationTarget = {
  readonly contactName: string;
  readonly conversationId: string;
  readonly opportunityTitle: string;
  readonly phoneE164: string | null;
  readonly stageName: string;
};

/**
 * Painel de conversa dentro do pipeline.
 *
 * O histórico é buscado quando o painel abre, não junto com o quadro: carregar
 * todas as conversas de todos os cards custaria caro para exibir uma.
 *
 * A mensagem enviada aparece imediatamente como pendente (envio otimista) e é
 * substituída pelo estado real na próxima leitura. Isso é honesto porque o
 * backend realmente já gravou a intenção — a mensagem existe e está `pending`;
 * o que ainda não aconteceu é a entrega, e é exatamente isso que o rótulo diz.
 */
export function ConversationPanel({ target, onClose, timeFormatter }: {
  target: ConversationTarget | null;
  onClose: () => void;
  timeFormatter: Intl.DateTimeFormat;
}) {
  const [messages, setMessages] = useState<readonly WhatsAppThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const conversationId = target?.conversationId ?? null;

  /*
   * O painel é montado só quando abre e desmontado ao fechar, então
   * `conversationId` não muda ao longo da vida do componente: o estado nasce
   * "carregando" e só é escrito quando a resposta chega. Não há reset a fazer
   * na entrada do efeito.
   */
  useEffect(() => {
    if (!conversationId) return;
    let active = true;

    void (async () => {
      const result = await loadWhatsAppThreadAction({ conversationId });
      if (!active) return;
      if (result.ok) setMessages(result.messages);
      else setError(result.message);
      setLoading(false);
      // Abrir a conversa é o ato de lê-la; zerar o contador aqui é o que faz o
      // badge do card sumir sem exigir um botão "marcar como lida".
      void markConversationReadAction({ conversationId });
    })();

    return () => { active = false; };
  }, [conversationId]);

  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messages]);

  if (!target) return null;

  async function send(text: string) {
    const body = text.trim();
    if (!body || !conversationId || sending) return;
    setSending(true);
    setError(null);

    const optimisticId = `pendente-${Date.now()}`;
    setMessages((current) => [...current, {
      deliveryStatus: "pending",
      direction: "outbound",
      id: optimisticId,
      messageType: "text",
      occurredAt: new Date().toISOString(),
      textContent: body,
    }]);
    setDraft("");

    const result = await sendWhatsAppMessageAction({ conversationId, textContent: body });
    if (!result.ok) {
      setMessages((current) => current.filter((message) => message.id !== optimisticId));
      setDraft(body);
      setError(result.message);
    } else if (result.warning) {
      setError(result.warning);
    }
    setSending(false);
  }

  return <SidePanel
    header={<div className="min-w-0 space-y-1">
      <h2 className="truncate text-base font-semibold">{target.contactName}</h2>
      <p className="truncate text-sm text-muted-foreground">
        {target.phoneE164 ? formatBrPhoneDigits(target.phoneE164) : "Telefone não disponível"}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        <StatusBadge tone="accent">{target.stageName}</StatusBadge>
        <StatusBadge>{target.opportunityTitle}</StatusBadge>
      </div>
    </div>}
    onClose={onClose}
    open
    title={target.contactName}
  >
    <div className="flex min-h-0 flex-col gap-3">
      {error ? <FeedbackBanner tone="warning">{error}</FeedbackBanner> : null}

      <div className="scroll-slim max-h-[50dvh] min-h-40 overflow-y-auto pe-1" ref={threadRef}>
        {loading ? <LoadingState label="Carregando conversa…" /> : null}
        {!loading && messages.length === 0 && !error
          ? <p className="py-6 text-center text-sm text-muted-foreground" role="status">
            Nenhuma mensagem nesta conversa ainda.
          </p>
          : null}

        <ol className="space-y-2">
          {messages.map((message) => {
            const outbound = message.direction === "outbound";
            const status = message.deliveryStatus ?? "";
            return <li
              className={cn("flex", outbound ? "justify-end" : "justify-start")}
              key={message.id}
            >
              <div className={cn(
                "max-w-[85%] rounded-lg border px-3 py-2 text-sm",
                outbound
                  ? "border-accent/30 bg-accent/10"
                  : "border-border bg-surface-subtle",
              )}>
                <p className="whitespace-pre-line break-words">
                  {message.textContent?.trim()
                    ? message.textContent
                    : conversationPreview(message.messageType, null, null)}
                </p>
                <p className="mt-1 flex items-center gap-2 text-[0.6875rem] text-muted-foreground">
                  <span className="tabular-nums">
                    {timeFormatter.format(new Date(message.occurredAt))}
                  </span>
                  {outbound && DELIVERY_STATUS_LABELS[status] ? <StatusBadge
                    tone={DELIVERY_STATUS_TONES[status] ?? "neutral"}
                    variant="inline"
                  >
                    {DELIVERY_STATUS_LABELS[status]}
                  </StatusBadge> : null}
                </p>
              </div>
            </li>;
          })}
        </ol>
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_REPLIES.map((reply) => <Button
            key={reply}
            onClick={() => setDraft(reply)}
            size="sm"
            type="button"
            variant="outline"
          >
            {reply}
          </Button>)}
        </div>

        <label className="block text-xs font-medium text-muted-foreground" htmlFor="whatsapp-draft">
          Mensagem
          <textarea
            className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            id="whatsapp-draft"
            maxLength={4096}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            value={draft}
          />
        </label>

        <div className="flex items-center justify-between gap-2">
          <p className="text-[0.6875rem] text-muted-foreground">
            Enter envia · Shift+Enter quebra linha
          </p>
          <Button
            disabled={sending || !draft.trim()}
            onClick={() => void send(draft)}
            size="sm"
            type="button"
          >
            <Send aria-hidden="true" />
            {sending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      </div>
    </div>
  </SidePanel>;
}
