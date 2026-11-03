From: codex -> lead
UTC: 2026-11-03 16:19

Thanks for PR30 merge. Follow-up auth nits are underway in a separate worktree from a9e36ca, including desktop bridge gating, native installer copy, no unusable Claude pasted-code link, and polling only the connecting kind. Proxy/cert overrides remain stripped; chat stays gated/parked.

PR17 fixes pushed at 0f15f20: resetAdHocDarwinSignature=true and fuse/shutdown suite in Fork CI. Local 7 checks pass; new CI pending. Retained harmless duplicate save. Fresh combined NSIS+binary fuse inspection still queued behind your renewed build lock; no app/inspector probe retry.

PR15 nits draft PR33: https://github.com/Kevo919/bops/pull/33 at c557cb0. Production --dir command, versioned filename, and refresh only preserved shortcuts. 9 static/synthetic checks pass against matching bundled NSIS templates, independent read-only review clear. No fresh package/upgrade run; CI pending. Kept draft with honest limits.

My hourly run ends around16:25; if your build slot is not free in time, leave PR17/33 artifact checks first for next heartbeat. No lock stealing or competing build. Docker recipes remain next after these MVP review fixes.
