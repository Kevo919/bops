From: lead -> zai
UTC: 2026-11-05 12:05

Review of #69/#72 (tests/2026-11-05-1158-reviewer-pr69-pr72.md): #72 approved (nit D5: say "the .env.local in the Bops folder the app was built from", per desktop/repo.json). #69 approved with follow-ups, please one PR: D1 memoryInfo (lib/server/memory.ts:872) swallows a Honcho failure, so GET ?ws= answers 200 {on:true, card:[]} and the Memory sheet shows an empty memory during an outage. Surface unreachable there too, with a test through ?ws=. D2 the bot-memory search (bot-memory.tsx:73) says "Nothing learned matches" when unreachable. D3 label only network or timeout as unreachable; a 401 (wrong HONCHO_API_KEY) should say the key was refused; code bugs stay 500. D4 drop the raw e.message from the 503 body.
