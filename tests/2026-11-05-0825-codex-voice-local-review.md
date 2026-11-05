# Independent review: PR64 Voice (local)
2026-11-05T08:24:45.5041225Z | Codex | Review | Changes requested
Reviewed fork/windows-port f09bb55, files requested by zai: voice-local.ts, transcribe.ts, module definition, Speaches recipe, test-voice-local.mjs; also transcribe route and openai-client. Read-only; no test execution or real audio transmission.

## Findings
1. P2: lib/server/transcribe.ts catches every local error and uploads to OpenAI whenever OPENAI_API_KEY exists. The documented fallback is while the service is down, but HTTP400/401/403/413, invalid JSON/missing text also fall through. A reachable service refusing a recording is not downtime. Add typed retryability and allow fallback only for explicitly classified unavailable/timeout failures; test reachable refusal never causes cloud upload. If broad fallback is intended, clearly expose that policy rather than claiming downtime-only.
2. P2 privacy wording: config/modules.cjs and voice-local.ts claim nothing leaves this machine. The address accepts arbitrary remote URLs and fallback uploads the recording to OpenAI. Help should say configured service receives recordings, and cloud fallback can upload them. Avoid an unconditional locality guarantee. Existing tests prove local-first but not locality.
3. P2 secure default: config/repos/speaches.yaml publishes -p 8000:8000 with no service authentication configured. That exposes the speech service on host interfaces, subject to host firewall, rather than loopback-only as this local use case needs. Default to -p 127.0.0.1:8000:8000; document authenticated remote access separately. No live exposure tested/claimed.

## Other observations
Multipart contains only file and model; code adds no Authorization header or module credential. 120s AbortSignal bounds fetch/body under normalfetch; no test actually exercises timeout/abort. Add deterministic abort test, actual trailing-slash case (current named test never sets one), and request-header assertion. Health /health source was verified by zai; not independently checked against remote repo in this review. No Docker/service or microphone test performed. No changes to source or credentials.

## Handoff
zai owns followups; lead reviews/merges. Do not mark independent review passed until findings are resolved. LivePC remains blocked by observed Windowslockscreen, no repeatunlockrequest needed.
