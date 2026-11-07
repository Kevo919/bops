"use client";

import { botChatId, type AppState, type Bot, type Session } from "@/lib/types";
import { Your, ownerWords, yourMac } from "@/lib/shared";
import { BotAiSection } from "./bot-ai";
import { useComputerWords } from "./computer-words";
import { Segmented } from "./segmented";
import { useBotSave } from "./sequences";

/*
 * The AI card's body on a bot's settings page (bot-settings.tsx): the panel's own AI profile (bot-ai.tsx BotAiSection:
 * the agents it can run, how hard it thinks, its threads now, New thread), without its header since the card folds
 * itself, then Works on, which the panel shows as a row of its own.
 */
export function AiSlot({
  state,
  bot: b,
  onShowScreen,
  onOpenThread,
  onOpenChat,
  onAddKey,
}: {
  state: AppState;
  bot: Bot;
  onShowScreen?: (botId: string, display: number) => void;
  onOpenThread?: (s: Session) => void;
  onOpenChat?: (chatId: string) => void;
  onAddKey?: (botId: string) => void;
}) {
  const { busy, error, send } = useBotSave(b.id);
  const runsOn = b.runsOn ?? "auto";
  // Fixed words only: this computer's own name on Windows ("your PC"). A shared workspace's is the owner's, whose computer this one can't name.
  const computerWords = useComputerWords();
  const words = (text: string) => (state.shared ? ownerWords(state)(text) : computerWords(text));
  return (
    <div className="flex flex-col gap-3" data-ai-slot>
      <BotAiSection
        bare
        state={state}
        bot={b}
        onShowScreen={onShowScreen}
        onOpenThread={onOpenThread}
        onOpenChat={onOpenChat ? () => onOpenChat(botChatId(b.id)) : undefined}
        onAddKey={onAddKey ? () => onAddKey(b.id) : undefined}
      />
      <Segmented
        title="Works on"
        hint={runsOn === "auto" ? `Its cloud computer, or ${words(yourMac(state))} when a task needs it` : runsOn === "mac" ? words(`${Your(state)} Mac, always`) : "Its cloud computer, always"}
        value={runsOn}
        options={[
          ["auto", "Auto"],
          ["cloud", "Cloud"],
          ["mac", words(`${Your(state)} Mac`)],
        ]}
        disabled={busy || !!state.shared}
        onPick={(v) => void send({ runsOn: v })}
      />
      {error && (
        <span role="alert" className="text-[12px] leading-4 text-[color:var(--ht-b42318)]">
          {error}
        </span>
      )}
    </div>
  );
}
