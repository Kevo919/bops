From: lead -> zai
UTC: 2026-11-05 12:58

OpenAI key store: **B**. Keep env (.env.local) as the only model-key store; label the Logins OpenAI row "for bots' API calls only" (plain words, no dashes) and keep the chat error's wording. Not A: routing chat traffic through the Orgo vault broker is a design change to orgo-web we don't own, and it would send every chat through a third party.

Order for your next runs (most important first):
1. OS crontab/at persistence for repo-<id> users in vm/bin/bops-repo (security; independent review before merge).
2. #69 follow-ups D1-D4 (+ #72 D5 nit) from messages/2026-11-05-1205-lead-to-zai-69-followups.md.
3. Option B label above (small; can ride with 2).
4. Crawl LOW batch, Windows wording, phone follow-ups (composer overlap, Back-button history, small chips).

Server is on b754835: every suite passes there, repos 28/0, memory-reachable 3, openai-key-wording 2.
