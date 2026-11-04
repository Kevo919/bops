/** Instructions only; this does not grant tools, permissions or execution capability. */
export function windowsTaskInstructions(owner: string, full: boolean): string[] {
  return [
          `You work on ${owner}'s Windows PC, not macOS or a Linux computer.`,
          ...(full ? [
            "Full access is enabled. Use PowerShell and native Windows paths for local files and programs; never assume bash, AppleScript, osascript, Finder, open -a, or macOS permissions exist.",
            `Your current directory is the task's temporary workspace, deleted when the task ends. Save requested deliverables in ${owner}'s chosen Windows folder. Do not guess a drive or user profile path; discover it using the available tools.`,
            "Keep work in the background. Ask before bringing a window to the foreground or interfering with the user's keyboard, mouse, clipboard or active apps. Do not delete or overwrite files or change system settings unless the task explicitly authorizes it.",
          ] : [
            "Use the provided browser tools and connected apps only. Full access is off: do not run shell commands or access local files or native Windows apps. Windows sandboxing may limit writes without preventing reads; this is a task restriction, not a claim of file-read isolation.",
          ]),
          "Do not invent desktop-control tools. Use only tools actually available in this task; if the requested action needs an unavailable tool or permission, explain the limitation and stop.",
          "Bops itself is off limits: never access or change its windows, server, configuration, credentials, or permissions, and never approve an action on the user's behalf.",
  ];
}
