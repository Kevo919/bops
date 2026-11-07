"use client";

import { useContext, useId, useState } from "react";
import type { ChatErrorInfo } from "@/lib/chat-error";
import { BRAINS_ON } from "@/lib/types";
import { OpenSettings } from "./open-settings";

/**
 * A bot couldn't answer because its chat model's provider said no (Message.chatError, lib/chat-error.ts): the plain
 * line, a button to Settings → AI plans to pick another model, and Details, which shows the provider's own words
 * (never a key: the server took them out). In place of the bot's bubble; its look follows the theme's tokens.
 */
export function ChatErrorCard({ error, readOnly = false }: { error: ChatErrorInfo; readOnly?: boolean }) {
  const openSettings = useContext(OpenSettings);
  const [open, setOpen] = useState(false);
  const detailsId = useId();
  return (
    <div
      role="alert"
      data-chat-error={error.kind}
      className="flex max-w-[460px] flex-col gap-2 rounded-[18px] bg-[color:var(--hb-fafaf9)] px-3.5 py-3 text-[14px] leading-5 shadow-[0_0_0_1px_var(--h-e6e6e3)]"
    >
      <div className="flex items-center gap-1.5 text-[13px] font-semibold leading-4 text-[color:var(--ht-b54708)]">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden className="shrink-0">
          <path d="M8 1.8 15 14H1L8 1.8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M8 6.3v3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="11.9" r=".9" fill="currentColor" />
        </svg>
        <span data-chat-error-title>{error.title}</span>
      </div>
      <p data-chat-error-text className="[overflow-wrap:anywhere]">
        {error.text}
      </p>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {openSettings && !readOnly && (
          <button
            type="button"
            data-chat-error-settings
            onClick={() => openSettings(BRAINS_ON ? "ai" : "profile")}
            className="rounded-full bg-[color:var(--hb-0a0a0a)] px-3.5 py-1.5 text-[13px] font-semibold leading-4 text-[color:var(--bops-on-fill)]"
          >
            Open Settings → AI plans
          </button>
        )}
        {error.details && (
          <button
            type="button"
            data-chat-error-toggle
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((o) => !o)}
            className="rounded-full px-2.5 py-1.5 text-[12.5px] font-medium leading-4 text-[color:var(--ht-3a3a38)] shadow-[0_0_0_1px_var(--h-e2e2df)] hover:bg-[color:var(--hb-f2f2f0)]"
          >
            {open ? "Hide details" : "Details"}
          </button>
        )}
      </div>
      {error.details && open && (
        <pre
          id={detailsId}
          data-chat-error-details
          className="max-h-40 overflow-auto whitespace-pre-wrap rounded-[10px] bg-[color:var(--hb-f2f2f0)] px-2.5 py-2 font-mono text-[11.5px] leading-[16px] text-[color:var(--ht-3a3a38)] [overflow-wrap:anywhere]"
        >
          {[error.provider, error.status ? `HTTP ${error.status}` : ""].filter(Boolean).join(" · ")}
          {error.provider || error.status ? "\n" : ""}
          {error.details}
        </pre>
      )}
    </div>
  );
}
