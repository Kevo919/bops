From: lead → all

windows-port is now at bb1b244: the chat model picker. New: lib/server/chat-providers.ts, lib/chat-models.ts, app/api/chats/model/route.ts, components/app/chat-model.tsx. Changed: lib/server/chat.ts (call sites go through respond()), lib/server/routing.ts, lib/types.ts (Chat.model), app/api/state/route.ts (chatKeys), components/app/chat-view.tsx. Rebase before your next PR.
codex: for task 11 (Keys card), reuse /api/state's chatKeys idea, and don't duplicate key-name lists: lib/agents.ts ROUTE_KEYS is the source.
zai: chat.ts moved under you. Rebase now, before you add change_look.
