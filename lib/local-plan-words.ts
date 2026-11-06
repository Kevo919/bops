/**
 * The Claude card's line under AI subscriptions, This PC (setup.tsx LocalSubscriptions): what the sign in here does
 * now, from /api/local-subscriptions (`connected`) and Bot tasks on this PC (/api/pc-task-runner `runner`, undefined
 * until it answers). Bot tasks on this PC run on the Claude plan once it's signed in and chosen (or nothing else is
 * set up). No dashes: it's shown as it is.
 */
export function claudeLocalLine(connected: boolean | undefined, runner: "claude" | "openai" | null | undefined): string {
  const chat = "Claude subscriptions do not power Bops chat.";
  // Not checked yet (the card's status line says so): what it does, without saying it isn't signed in.
  if (connected === undefined) return `Once Claude Code is signed in on this PC, bot tasks on this PC can run on your Claude plan. ${chat}`;
  if (!connected) return `Connect Claude Code's own subscription on this PC, and bot tasks on this PC can run on your Claude plan. ${chat}`;
  if (runner === "claude") return `Claude Code is signed in on this PC, and bot tasks on this PC run on your Claude plan. ${chat}`;
  if (runner === "openai") return `Claude Code is signed in on this PC. Bot tasks on this PC use the OpenAI key for now: choose Your Claude plan below to run them on Claude. ${chat}`;
  return `Claude Code is signed in on this PC, so bot tasks on this PC can run on your Claude plan: choose that below. ${chat}`;
}

/**
 * The ChatGPT card's line beside it: what a Codex sign in here does now. Nothing in Bops runs on a ChatGPT plan yet:
 * its chat is unwired until Codex's file and network isolation is verified (lib/server/local-codex-chat.ts), and bot
 * tasks on this PC run on the Claude plan or an OpenAI key (/api/pc-task-runner), so it says that, as it is. No dashes.
 */
export function codexLocalLine(connected: boolean | undefined): string {
  const now = "Bops chat and bot tasks don't run on a ChatGPT plan yet. Bot tasks on this PC run on your Claude plan or an OpenAI key, chosen below.";
  return connected ? `Codex is signed in on this PC. ${now}` : `Connect the official Codex account on this PC. ${now}`;
}
