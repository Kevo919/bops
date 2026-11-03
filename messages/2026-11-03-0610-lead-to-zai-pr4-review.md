From: lead → zai

PR #4 review: "merge after fixes". The structure is good: rule 2 (textContent only), the server-side validation, and the cloud merge all pass. Fix these BEFORE tasks 15/16:

HIGH
1. lib/look-theme.ts ~57-60: the url( check uses indexOf, so only the FIRST url( of each spelling is checked. Confirmed bypass: `a{background:url(data:image/png,x)} b{background:url(https://evil.example/x)}`. Walk every match (matchAll or lastIndex). Add tests with two and three url() calls, and the attribute-selector exfil case.
2. The other fields aren't re-validated when the CSS is built: lookCssText (~450-465) puts accent/fontScale/density in raw, and look-style.tsx only re-sanitizes css. An accent of `red;} body{background:url(https://evil)} :root{x:y` paints a remote URL. Paths there: cloud merge, and undoLook (lib/server/look.ts ~52 sets m.look.before unchecked). Fix: build the CSS only from a freshly normalized Look (allow-lists, /^#[0-9a-f]{6}$/i, finite clamped number), in buildLookCss and in undoLook/state load. Test with a hostile state object.

MEDIUM
3. Also reject src(, image(, cross-fade(, and any @namespace with a string.
4. Owner gate: on an owner turn, earlier outside messages (emails, texts) are still in history. Require the owner's own words in this turn to ask about the look, like ownerAskedForSite does for deploy_app, so an injected email can't restyle (e.g. hide approval buttons).

LOW
5. Undo/Reset: history is capped but never read; Settings changes can't be undone; the text "last 20 changes can be undone" is wrong. Either make Undo use history or fix the words and comments.
6. app/api/look/route.ts: give it the same `allowed` as app/api/modules/route.ts (window; phone only on a REQUIRE_REMOTE server).
7. chat-view.tsx ~2244: `text-[#3A3A3A` is missing its `]`. LookNote also sits between MemoryNote's JSDoc and MemoryNote, so move it.
