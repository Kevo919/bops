"use client";

import { useState } from "react";
import type { AppState, Chat } from "@/lib/types";
import { chatKeyName, chatModelLabel, chatModels, chatModelShown, providerName, providerOf, type ChatModel } from "@/lib/chat-models";
import type { AgentRoute } from "@/lib/agents";
import { post } from "./ui";
// The default for new chats (Settings, Models), named in the box's hint.
import { chatDefault } from "@/lib/chat-models";

/**
 * The model a chat's replies run on (Chat.model), picked in its message box: Auto (OpenAI, as before) first, then
 * Your LLMs and the built in ones, by provider. One whose key isn't set on this server says "(no key)", and the line
 * under the box names the key to add (chatModelHint). The pick stays with the chat and applies to its next message.
 */
export function ChatModelPick({ state, chat: c, onError }: { state: AppState; chat: Chat; onError?: (line: string | null) => void }) {
  const [saving, setSaving] = useState(false);
  if (state.shared) return null;
  const keys = state.chatKeys ?? {};
  const value = c.model ?? "";
  const current = chatModels().find((m) => m.id === value);
  // What new chats start on (Settings, Models), for the box's hint; this chat's own pick, or Auto, is what it runs on.
  const fallback = chatDefault(keys);
  return (
    <select
      aria-label="Model for this chat"
      title={`${current ? `Replies in this chat run on ${chatModelLabel(current)}` : "Replies in this chat run on Auto (OpenAI)"}${fallback ? `. Default for new chats: ${fallback.name}` : ""}`}
      value={value}
      disabled={saving}
      onChange={async (e) => {
        const model = e.target.value || null;
        setSaving(true);
        onError?.(null);
        try {
          const res = await post("/api/chats/model", { chatId: c.id, model });
          if (!res.ok) onError?.(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't change this chat's model.");
        } catch {
          onError?.("Couldn't change this chat's model.");
        } finally {
          setSaving(false);
        }
      }}
      className="h-[30px] max-w-[150px] shrink-0 cursor-pointer truncate rounded-full bg-transparent px-2 text-[12.5px] leading-4 text-[#3A3A38] outline-none hover:bg-[#F2F2F0]"
    >
      <ChatModelOptions keys={keys} value={value} auto="Auto (OpenAI)" />
    </select>
  );
}

/**
 * The options of a model picker (the chat's, a routine's): Auto first (`auto`, its words), then Your LLMs (presets
 * as "Preset: <name>") and the built in ones, by provider, "(no key)" on one whose key isn't set here. Ollama's only
 * where it's set up. `value`, the pick now, is always there: one taken out of config/llms.yaml since shows by its id.
 * Read at each render from lib/agents.ts llms(), which the window keeps in step with the state (ui.tsx).
 */
export function ChatModelOptions({ keys, value, auto }: { keys: Partial<Record<string, boolean>>; value: string; auto: string }) {
  const models = chatModels().filter((m) => m.id === value || chatModelShown(m, keys));
  const groups = new Map<AgentRoute, ChatModel[]>();
  for (const m of models) groups.set(m.provider, [...(groups.get(m.provider) ?? []), m]);
  const gone = value && !models.some((m) => m.id === value) ? value : null;
  return (
    <>
      <option value="">{auto}</option>
      {[...groups].map(([provider, list]) => (
        <optgroup key={provider} label={providerName(provider)}>
          {list.map((m) => (
            <option key={m.id} value={m.id} {...(m.preset ? { "data-preset": "" } : {})}>
              {chatModelLabel(m)}
              {keys[provider] ? "" : " (no key)"}
            </option>
          ))}
        </optgroup>
      ))}
      {gone && <option value={gone}>{gone}</option>}
    </>
  );
}

/** The line under the box when the chat's model has no key on this server: which key to add, and where. Null when it has one, or it's Auto. */
export function chatModelHint(state: Pick<AppState, "chatKeys" | "shared">, c: Pick<Chat, "model">): string | null {
  const p = providerOf(c.model);
  if (!p || state.shared || state.chatKeys?.[p]) return null;
  if (p === "ollama") return `Ollama isn't set up on this server: add OLLAMA_BASE_URL (its address, like http://127.0.0.1:11434/v1) to .env.local, then restart Bops.`;
  return `${providerName(p)} has no key on this server yet: add ${chatKeyName(p)} to .env.local, then restart Bops.`;
}
