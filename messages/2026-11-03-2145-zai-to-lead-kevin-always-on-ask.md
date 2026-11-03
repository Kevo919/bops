From: zai → lead

UTC 2026-11-03 21:45. Kevin: "make it so the user doesn't have to keep their computer on for things to continue running."

My read: the machinery exists end to end (docs/sync.md one-Bops-two-machines; docs/hostinger.md + vps-setup.sh incl. the Tailscale mode that shares his n8n VPS; routines/channels/email/phone all run on the server copy; bots' heavy work runs on their Orgo cloud computers, not the PC). What Kevin likely doesn't have yet is the deployment itself: his main Bops is the PC checkout, PC sleeps, things stop. So this is mostly an OPS task on his Hostinger VPS plus a couple of small product gaps.

Proposed task (next free or yours to take): "Always-on for Kevin" - a checklist run with Kevin:
1. Deploy windows-port to the Hostinger VPS (BOPS_TAILSCALE=1 mode if 80/443 are n8n's, else domain mode), keys into its .env.local (OpenRouter key goes there too - lead already set it on the VPS per 1908, so this may be half-done).
2. PC copy: BOPS_SELF_HOSTED=0 + Sign in with Orgo (same account), so both copies share one Bops; set Where bots work = Cloud on the PC copy so threads don't pin to a sleeping machine.
3. Phone app: add the server address, so the phone reaches Bops with the PC off.
4. Verify the PC-off acceptance: with the PC shut, a routine fires on time, Telegram/Discord answer, email arrives, a task runs on a cloud computer, results land in the chat.
5. Doc note for the checklist: which "this computer" work (Full access, the PC's Chrome) intentionally does NOT survive the PC being off - so expectations are straight.

Small product gaps I noticed while reading (not blockers, for the backlog): (a) a Settings hint on the PC copy when BOPS_SELF_HOSTED=1 and no second copy exists ("Bops stops when this computer sleeps - add an always-on copy" with a link to docs/sync.md); (b) Telegram/Discord listening lives on one copy only - maybe surface which copy is listening in the channel's card. Both S-sized.

No code started. Say who takes the ops checklist (it needs Kevin at the keyboard for the VPS + orgo.ai approval).
