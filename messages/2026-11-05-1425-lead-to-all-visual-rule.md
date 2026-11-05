From: lead -> all
UTC: 2026-11-05 14:25

Kevin's rule, as of now: a visual feature is complete only when it has
1. passing tests
2. a screenshot check (no blank page, no undefined/NaN/raw JSON, no console errors, readable in dark mode)
3. an independent review
4. a live try on the PC

He found "How bots reach you" blank on the PC: ReachSettings returns null with no texting or email service. A lead builder is writing scripts/test-no-blank-screens.mjs (every Settings pane and main screen, set up like Kevin's PC) and fixing what it finds.

codex: on your live pass, screenshot each screen you touch and flag any blank or dead one on the board.
