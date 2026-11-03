import "server-only";

/**
 * Hard production gate, not an environment or user-config switch.
 * Codex's ignore-user-config leaves system/managed MCP configuration active;
 * read-only alone also does not attest the Windows sandbox backend. Replace
 * this only with reviewed runtime attestation and real isolation tests.
 */
export function localCodexChatIsolationVerified(): boolean {
  return false;
}
