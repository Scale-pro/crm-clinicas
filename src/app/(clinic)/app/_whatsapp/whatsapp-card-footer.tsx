"use client";

import { useMemo, useState } from "react";

import { ConversationPanel, type ConversationTarget } from "./conversation-panel";
import { conversationPreview, truncatePreview } from "./whatsapp-view";

export type CardConversation = {
  readonly conversationId: string;
  readonly lastMessageAt: string | null;
  readonly lastMessageDirection: string | null;
  readonly lastMessageText: string | null;
  readonly lastMessageType: string | null;
  readonly needsReplyFrom: string | null;
  readonly unreadCount: number;
};

/**
 * Rodapé de conversa do card e o painel que ele abre.
 *
 * O rodapé é um botão porque abre um painel — não um link. Cor nunca carrega o
 * estado sozinha: "WhatsApp", a contagem e o aviso de resposta pendente são
 * texto (ADR-011).
 */
export function WhatsAppCardFooter({ contactName, conversation, opportunityTitle, stageName, timezone }: {
  contactName: string;
  conversation: CardConversation | null;
  opportunityTitle: string;
  stageName: string;
  timezone: string;
}) {
  const [open, setOpen] = useState(false);

  const formatters = useMemo(() => ({
    stamp: new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", hour: "2-digit", minute: "2-digit", month: "2-digit", timeZone: timezone,
    }),
    time: new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit", minute: "2-digit", timeZone: timezone,
    }),
  }), [timezone]);

  if (!conversation) {
    return <div className="mt-2 border-t border-dashed border-border pt-2">
      <span className="text-[0.6875rem] text-muted-foreground">Sem conversa vinculada</span>
    </div>;
  }

  const target: ConversationTarget = {
    contactName,
    conversationId: conversation.conversationId,
    opportunityTitle,
    phoneE164: null,
    stageName,
  };
  const unread = conversation.unreadCount > 0;
  const awaitingClinic = conversation.needsReplyFrom === "clinic";

  return <>
    <button
      className="mt-2 -mx-2.5 -mb-2.5 block w-[calc(100%+1.25rem)] rounded-b-md border-t border-border bg-success/[0.07] px-2.5 py-2 text-left transition-colors hover:bg-success/[0.13] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      onClick={() => setOpen(true)}
      type="button"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-success" />
          <span className="text-[0.6875rem] font-semibold uppercase tracking-wide text-success-strong">
            WhatsApp
          </span>
          {unread ? <span className="rounded-full bg-success px-1.5 text-[0.6875rem] font-bold leading-4 tabular-nums text-background">
            {conversation.unreadCount}
          </span> : null}
        </span>
        {conversation.lastMessageAt ? <span className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">
          {formatters.stamp.format(new Date(conversation.lastMessageAt))}
        </span> : null}
      </span>

      <span className="mt-1 block truncate text-xs">
        {truncatePreview(conversationPreview(
          conversation.lastMessageType,
          conversation.lastMessageText,
          conversation.lastMessageDirection,
        ))}
      </span>

      {awaitingClinic && !unread ? <span className="mt-1.5 inline-flex items-center rounded-md border border-warning/40 bg-warning/15 px-1.5 py-0.5 text-[0.6875rem] font-medium leading-4 text-warning-strong">
        Aguardando resposta da clínica
      </span> : null}

      <span className="sr-only">Abrir conversa de {contactName}</span>
    </button>

    {open ? <ConversationPanel
      onClose={() => setOpen(false)}
      target={target}
      timeFormatter={formatters.time}
    /> : null}
  </>;
}
