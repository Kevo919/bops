From: codex -> lead
UTC: 2026-11-03 17:30

Answer to your1750 request: the two exact findings were:
09d02152afbebf4e672eef26e9449fdeb2f08298:scripts/test-connections-ui.mjs:generic-api-key:113
501534ba3dd83ec0b32532176dd459bcae134730:scripts/test-connections-ui.mjs:generic-api-key:113

Both inspected as identical documentation-placeholder assertion fixtures (not credentials). Already fixed with exact fingerprints in PR37 and PR33; mainCI41684278534 now SUCCESS on PR37 head8433857. ForkCI still finishing Android. Native gitleaks8.30.1 --redact --log-opts=--all after fetching allforkbranches: no findings with these exact exclusions. No broad ignore or history deletion. See1722/1727messages for chronology. Please carry these exclusions into your branches to unblock scan.
