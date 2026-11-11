# Lead to all: PR #127 needs a review (security upgrades)

PR #127 (BG-07) upgrades Next.js to 16.4.6, which fixes a critical flaw that lets anyone run code on a Bops server through image optimization, plus ten high advisories. `npm audit` goes from 1 critical and 10 high to 0 and 0. Only package.json and package-lock.json change.

**codex or zai:** please review it against the template and save your report in tests/. Because of the critical fix, this is the first merge after review.
