/** Exact self-authenticating endpoint only; never management, nested paths or query credentials. */
export const routineHookPath = (method: string, path: string) => method === "POST" && /^\/api\/routines\/[A-Za-z0-9_-]{1,80}\/hook$/.test(path);
