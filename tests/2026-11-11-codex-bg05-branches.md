# BG-05 branch inventory

Checked 2026-11-11T23:43:35.6096006Z by Codex against live fork refs and paginated GitHub PR metadata. Base: 1a00bd3b41a33b8762985d7df48c0d5e6a1dc5d3.

136 live branches. MERGED means the exact branch tip is an ancestor of windows-port. A merged PR alone is insufficient because subsequent commits or squash merges can leave unique history. No branch is labeled dead from inactivity alone. REVIEW rows require owner disposition. Base and board branches are protected in this proposal. No branches deleted.

Lead: review this list for at least 24 hours before any deletion. Re-fetch and recheck exact tip hashes and open PRs before deleting; changed tips invalidate this snapshot. Under-20 target is not achieved by this inventory.

| Branch | Tip | Classification | PRs |
|---|---|---|---|
| claude/bg06-feature-status-true | e4d9050e770b3adf7289a1e387344ef1e54e67b6 | MERGED: ancestry verified | #128 closed |
| claude/bg07-security-upgrades | 27a4e6438a75f860ba51559ef8f61b4eecd4aede | MERGED: ancestry verified | #127 closed |
| claude/bg14-scan-exceptions | 7841c067d7e38109e42316f26cacf7a9aff4be87 | MERGED: ancestry verified | #129 closed |
| claude/task-60-r3 | 90f7d242cdf2d361485b491c7e4ac3cf98f54d45 | MERGED: ancestry verified | #122 closed |
| codex/executor-lifecycle | f0072c2eb7e85135257b070eb73bdc84dbf098c5 | MERGED: ancestry verified | #48 closed |
| codex/fix-executor-key-guide | 57338605c5bcaf95114351d42d58e49f6519af05 | MERGED: ancestry verified | #56 closed |
| codex/fix-hosted-apps-windows | c357b5d2da853c788e6d505747a2c0852d528808 | MERGED: ancestry verified | #60 closed |
| codex/fix-memory-blank-config | ccc368b34a697f8c0c92fffa05f18c83b5eeaca6 | MERGED: ancestry verified | #76 closed |
| codex/fix-outside-teammate-memory | 19d26487f853470d48e06073c097dedc1b065de6 | MERGED: ancestry verified | #62 closed |
| codex/fix-private-repo-status | a71deb4c65147724df059071f9ff41c35be548f9 | MERGED: ancestry verified | #63 closed |
| codex/fix-review-followups-91-92-97 | 978a82b320575a96531be4c6cc9329b7086c5778 | MERGED: ancestry verified | #120 closed |
| codex/fix-user-settings-copy | 3f289e44aeeeecb0e10018718f84516ed470eec2 | MERGED: ancestry verified | #121 closed |
| codex/fix-windows-update-feed | 1ebe36e8e937b886cbad9b81b1cdfc755309ebe2 | MERGED: ancestry verified | #125 closed |
| codex/fork-ci-followup | 20ef0120ea0a49f6200d550394acdf7231c3b6e6 | MERGED: ancestry verified | #18 closed |
| codex/linux-runner-line-endings | 33452b1a460e0b2c8f601ae85ec6348e674e4650 | MERGED: ancestry verified | #24 closed |
| codex/local-subscription-followups | 235507c5ed522879dcd9ea209de69995b5844b4e | MERGED: ancestry verified | #37 closed |
| codex/models-refresh | fe78a9cd8823fcc0579a19bc0aa860d48b9d4130 | MERGED: ancestry verified | #46 closed |
| codex/routine-events-core | e46cea66903961756257c7474d1369142f8d79da | MERGED: ancestry verified | #126 closed |
| codex/test-copy-scope-fallback | bd23eceeebe93e243e7a2ac99be1867c4000603b | MERGED: ancestry verified | #124 closed |
| codex/test-settings-member-followups | 47305f64604fa9308f28bcaeec4df52b39cd9719 | MERGED: ancestry verified | #123 closed |
| codex/windows-identity | 33b10db37a72180c7e5b69354c8a4f858f5ed003 | MERGED: ancestry verified | #49 closed |
| codex/windows-installer-followups | 2db484a5736e89358a53510022eed118b33c6ee4 | MERGED: ancestry verified | #33 closed |
| codex/windows-mcp-cwd | 7fc9d08821e75296d24547d7d9a540999ce1eb65 | MERGED: ancestry verified | #47 closed |
| feature/agent-instances | ba45ac7839b216436be75f0a9a4f4f3dd4402d35 | MERGED: ancestry verified | #91 closed |
| feature/agentphone-calls-texts | 00ec11de5c0587e71c59ca810e292008038b6cc4 | MERGED: ancestry verified | #102 closed |
| feature/ai-subscriptions | bbd5e08d06db0080fe02f893e4f390b9ce911012 | REVIEW: no open PR; intent unknown | #22 closed |
| feature/android-apk | 183b874775a073784cd6b42553560e0550db0e49 | MERGED: ancestry verified | #26 closed |
| feature/android-llms | bef864164f40d5b3d5b66d67ea1b0ae23b5370ae | MERGED: ancestry verified | #2 closed |
| feature/android-multi | 871a1bad030392f2f0850a1bfc15642946176a29 | MERGED: ancestry verified | #1 closed |
| feature/ci-failure-proof | 3b9e2770c50d2c7f735c18690df02222ffb534c6 | REVIEW: no open PR; intent unknown | #7 closed |
| feature/codex-plan | 89cf7aab93453a3311062580bac1a67defab19a5 | MERGED: ancestry verified | #20 closed |
| feature/composio-for-you | 799507b2e888a6afca3ef5f2e31c41e372bcb62b | MERGED: ancestry verified | #83 closed |
| feature/config-tests | 5560202c238066b9f4d0034bb0829902aeebde47 | MERGED: ancestry verified | #3 closed |
| feature/connections | 709977c847a3a47bd568e09fb8187e21122c265c | REVIEW: no open PR; intent unknown | #36 closed |
| feature/connections-v2 | 2adfcccad87b665bc459c1f3edc07d4afec4bed1 | MERGED: ancestry verified | #40 closed |
| feature/cron-routines | 408e9bae84c9755940f765a15fbf9c93ba16c91d | REVIEW: no open PR; intent unknown | #35 closed |
| feature/cron-routines-v2 | 9d05839092bbcc9f2878fa32ddd9bc495d70c2b1 | MERGED: ancestry verified | #52 closed |
| feature/dark-mode-everywhere | 7af17b16430e2b8799f83058d42878a1121a3918 | MERGED: ancestry verified | #85 closed |
| feature/docs-download-fix | 92988e99a81be0f071af080ae9463a1c334c3aa7 | MERGED: ancestry verified | #54 closed |
| feature/easy-phone-pairing | 430df4a20fa678eedc3123c21bac06a0d84e5074 | MERGED: ancestry verified | #77 closed |
| feature/fork-ci | f4dc3d68fdcf1135afd857308637c0d49bd49bcd | MERGED: ancestry verified | #6 closed |
| feature/goals-ideas | 60a696017180b17442b5d8327e0e15b6caed12e8 | MERGED: ancestry verified | #51 closed |
| feature/handy-card | 8f3f8cd4fcd0f06988f713a1024c0fb96fa86c30 | MERGED: ancestry verified | #34 closed |
| feature/in-progress-badges | aa40467bee473719fdbe7de903d496aa8abc1ff9 | MERGED: ancestry verified | #84 closed |
| feature/key-check | d6d705fb414d9d01aedb91b203c7031bbadaf46a | MERGED: ancestry verified | #10 closed |
| feature/keys-guide | fc0a8fad3b78dfcd28742938c3a7dc8c2c2c7db9 | MERGED: ancestry verified | #13 closed |
| feature/llms-endpoint | bb61ea3bd6f9fa6c5d485a5f785a0149c4a3135e | MERGED: ancestry verified | #14 closed |
| feature/local-subscriptions | 9f87d42b67c6e75b5ac8113cfe7b0a0b772e4f8a | MERGED: ancestry verified | #30 closed |
| feature/look-by-chat | a549d13fb802d2f8749912af40ecc5e856921877 | MERGED: ancestry verified | #4 closed |
| feature/make-doc | b8ecffae4c25f0cfbcddde5a70ce531c85554421 | MERGED: ancestry verified | #41 closed |
| feature/mcp-servers | d3ef9b09a02b841f0c41deadfe2ca7640daaefee | MERGED: ancestry verified | #32 closed |
| feature/mobile-layout | 69f9a5035d6125fdefca0e0bc1d6b6de2eb057df | MERGED: ancestry verified | #70 closed |
| feature/models-card | ae1a7c233b220d5b037630a856110ecbce2f409d | MERGED: ancestry verified | #31 closed |
| feature/ollama-chat | d479cc7feb003db69f1482d62f53891a56872958 | MERGED: ancestry verified | #28 closed |
| feature/openrouter-presets | 2b9be74abae14c0cabb6c757cc685158f33c6d60 | MERGED: ancestry verified | #44 closed |
| feature/pc-tasks-claude-plan | d5370f5b606881168e274e2bd32ea90425ef17d5 | MERGED: ancestry verified | #80 closed |
| feature/provider-accounts | 1f983c4d932b68c6f8b5024e7700f5c25bacae14 | MERGED: ancestry verified | #45 closed |
| feature/repo-recipes | 34dc06146a58b7a0e65d401dffd5340fb7295f9f | MERGED: ancestry verified | #21 closed |
| feature/repos-section | 75cc07d5c17c56f295873ad11ec0c50e80c65c14 | MERGED: ancestry verified | #38 closed |
| feature/routines-away | c4a5e700e45d7b39c0275664a73d553e436e8a34 | MERGED: ancestry verified | #19 closed |
| feature/service-keys-screen | bd783063cf9b143b01f3f8ae644ea7dc8ce90b0d | MERGED: ancestry verified | #87 closed |
| feature/soul-memory | 63c8027d4a2320faa4c99255f85247e4e8c69e20 | MERGED: ancestry verified | #39 closed |
| feature/tailscale-vps | a0326293da83e77ef67b0461ea1df1634ba357bf | MERGED: ancestry verified | #12 closed |
| feature/task36-recipe-verification | 515d83cb0f0cde9b92379499d930880f59eedeb3 | MERGED: ancestry verified | #53 closed |
| feature/test-checklist | 03cb9d7c63bff197a4b453366228163497566122 | MERGED: ancestry verified | #5 closed |
| feature/test-config | 3714bce872fba555828203c14a41f7cdcf16588c | REVIEW: no open PR; intent unknown | #8 closed |
| feature/thread-asks | 89a7cc0860e2ff9289b5bf411b1420b3cce03c7f | MERGED: ancestry verified | #27 closed |
| feature/voice-local | 346d838498fdb218a043a1606b73e0a2618f6b8d | MERGED: ancestry verified | #64 closed |
| feature/vps-dry-run | d1b524f298c6b8de417ef6d8af15c45ae1d53245 | REVIEW: merged PR, unique branch history | #16 closed |
| feature/watch-installer | 42b9eb15a3ad59a7be18ec22c20d83d2e01605bb | OPEN: active PR | #131 open |
| feature/wear-os-watch | d4a67283035731fa8186469c18de7a20988e358a | OPEN: active PR | #130 open |
| feature/widgets-by-chat | 6f014c4585777b7262b5dfe79d77f4c521731d23 | MERGED: ancestry verified | #86 closed |
| feature/windows-fuses | 0f15f20e050fcdd4a699f2b3ab34ecb6d8b8760b | MERGED: ancestry verified | #17 closed |
| feature/windows-installer | 0ad9342e9a5c340111c8f0198c898fa54fcf9ff2 | MERGED: ancestry verified | #15 closed |
| feature/windows-smoke | 942a076854a8e2a92f9e70d45c15a3e5213049c7 | MERGED: ancestry verified | #9 closed |
| feature/windows-tests | b774ab5b129f322bc19d1718f80d07024d6d66a1 | MERGED: ancestry verified | #11 closed |
| feature/zai-coding-cn | eb2698232c247a75d7bb8e5501372b2502506ad8 | MERGED: ancestry verified | #23 closed |
| fix/78-81-review | 7082df7b191dfac084fd466808a4d195e62c04c5 | MERGED: ancestry verified | #95 closed |
| fix/agentphone-status-number | 155c13ef930b4cccff7378d3c4606f542ca7b4e0 | MERGED: ancestry verified | #114 closed |
| fix/bops-repo-crontab | 8833fb0f893068b11a064f894a140a73cee2824b | REVIEW: no open PR; intent unknown | #89 closed |
| fix/bot-ai-isolation | 40d672383e7c300691151ed8beb62f18dfabf699 | MERGED: ancestry verified | #29 closed |
| fix/chat-errors-readiness | b97e0094f5212ce574502e1d640039415cfb3ea4 | MERGED: ancestry verified | #115 closed |
| fix/claims-nits-78 | 4407fb8a6eb65055a5fd9408eb9c5ff43c1c9633 | MERGED: ancestry verified | #110 closed |
| fix/claims-per-turn | bf39a9753776a5e5bcb0cc43a5751e465e0cbc5a | MERGED: ancestry verified | #108 closed |
| fix/composer-width | ea476040488174dac52eea718f2aa37964d0b321 | MERGED: ancestry verified | #42 closed |
| fix/crawl-low-2 | cc6c84b4d04fc8bc4440d90a2edd0010088464d1 | MERGED: ancestry verified | #75 closed |
| fix/crawl-low-3 | 862de2900e0edcd050e79d00a8f4e11c04b11b9f | MERGED: ancestry verified | #78 closed |
| fix/crawl-low-batch-1 | 546a946403a631f8db09c937f70470e300e03e11 | MERGED: ancestry verified | #73 closed |
| fix/cron-picker-regression | 80c473bbe46b5b01da87aa16e46ba6d4244d5731 | MERGED: ancestry verified | #79 closed |
| fix/e2e-ui-refused-load | 8dcbe21ddc2fe5361199bc9d9f936a8233fbb6bd | MERGED: ancestry verified | #67 closed |
| fix/e2e-ui-repos-padding | 812b9397394cc57982773471fcec160b467ecf83 | MERGED: ancestry verified | #66 closed |
| fix/e2e-ui-unpair-confirm | 4b1b508d70ef5b993df4f7e0f7b10a5b12711134 | MERGED: ancestry verified | #65 closed |
| fix/f38-firewall | d9ddb43f8d7d0c627994015792f8931e44bb8668 | MERGED: ancestry verified | #61 closed |
| fix/f38-member | b2fb835aac90326e4276f029cb1deb2244e852ca | MERGED: ancestry verified | #58 closed |
| fix/f38-plan | ca851d4d4d3fc5b84f52d594e4045f33a5c1d8be | MERGED: ancestry verified | #59 closed |
| fix/flaky-cloud-tests | 80217d5a2685993135bdc7ea8fe0e2523ee7e8fb | MERGED: ancestry verified | #96 closed |
| fix/gitleaks-fixtures | d4043dcb10783ce8d2d8e0e40e65982a3320f6ef | MERGED: ancestry verified | #43 closed |
| fix/key-store-agreement | 0e9918989995271991169dde986f358fb9e963a7 | MERGED: ancestry verified | #72 closed |
| fix/leftover-mac-words | f9a9bad3c307c9483d4d8731fdccd403b453cd65 | MERGED: ancestry verified | #104 closed |
| fix/live-retest-1107 | b6d91360da5cfa3c4220718f7b40b318eb31e5eb | MERGED: ancestry verified | #119 closed |
| fix/live-ui-pass-1107 | 1f080d196f7b87b26d6a5c44f320f0d489c57e67 | MERGED: ancestry verified | #116 closed |
| fix/llms-yaml-esm | a387338b4f3614fe563ae28f422a18d803023ce5 | MERGED: ancestry verified | #98 closed |
| fix/memory-gating | e4840047169ec5b7c0e5f9d3ddb50d1f281c8852 | MERGED: ancestry verified | #57 closed |
| fix/memory-outage-classifier | bc8c5574bee164b416c333135370ea6bc92baa45 | MERGED: ancestry verified | #106 closed |
| fix/memory-outages-2 | e6c15ce1f0fa4300e7b18a19056e01ee1018721e | MERGED: ancestry verified | #90 closed |
| fix/memory-unreachable-state | a97a559f178260cbbc00703694f520f94c233f91 | MERGED: ancestry verified | #69 closed |
| fix/no-blank-screens | be51478dcb3b8a6b3d1aec07f15acc1402eeca70 | MERGED: ancestry verified | #82 closed |
| fix/no-unbacked-action-claims | 01fce7cc00277ee043c07c7756db685147981c7c | MERGED: ancestry verified | #93 closed |
| fix/offer-cron-typing | f729a98b95bbbb8e15b84199565d0963f9f43aac | MERGED: ancestry verified | #74 closed |
| fix/page-note-text | 81fb27aed953617a6e8c4ef4687866147bded664 | MERGED: ancestry verified | #99 closed |
| fix/pairing-and-skill-import | 8bef3b2ed065c0b8feab9a4242425f5d3fc699b7 | MERGED: ancestry verified | #103 closed |
| fix/pc-task-chrome-start | 28649dc4d485fe6473dcab8f0b4991d17ee91bbd | MERGED: ancestry verified | #92 closed |
| fix/post-merge-review | 5280bb6f3e1497e616344a6816620063f41e20be | MERGED: ancestry verified | #55 closed |
| fix/preexisting-red-tests | a794e3eed63e68f783a5ac7c141a62ac2f87b2b8 | MERGED: ancestry verified | #109 closed |
| fix/red-tests-89 | a623102152041ee7d5818b4d66bf9bdeaf3defd6 | MERGED: ancestry verified | #117 closed |
| fix/repo-no-persistence | 348525f0d3ffffeeb95dd2be9529551cc122d661 | MERGED: ancestry verified | #94 closed |
| fix/test-brains | b108541eccc1051df76a69c9aafdcb35cd718334 | MERGED: ancestry verified | #25 closed |
| fix/test-repos-count | 57a0d69199b3ff4ece46e958b0268785b4ba2b53 | MERGED: ancestry verified | #71 closed |
| fix/usage-durability | 4e972fa49533debd9e0404a731c27b4d69b43e2d | MERGED: ancestry verified | #97 closed |
| fix/usage-nits-77 | 152df9edd19ea0e2da2220e70aa7e9cf0df98590 | MERGED: ancestry verified | #111 closed |
| fix/usage-pricing-edges | 486cd6b3649f652e5cbaa899e9404f1baa8774b0 | MERGED: ancestry verified | #107 closed |
| fix/usage-refs-all | 86e86af0df100bc9dcfc006267f966f5337b74ce | MERGED: ancestry verified | #105 closed |
| fix/voice-local-review | fc0309149cf36e2e1cee08f350a477024f00992f | MERGED: ancestry verified | #68 closed |
| fix/windows-copy | 8a121c3ba193aea7a1ef2b5db716b61ec55a7707 | MERGED: ancestry verified | #88 closed |
| fix/windows-wording | 021dba2144b0deae5265dadba91b4d855c61cfa5 | MERGED: ancestry verified | #81 closed |
| main | 1e1beae777cc0e293da2154934b67f2d431455d6 | KEEP: base/board |  |
| shots/live-retest-1107 | 6dc543f4abc22c918ec6ae9fcac29b8dc850a12e | REVIEW: no open PR; intent unknown |  |
| shots/live-ui-pass-1107 | 68390f21d8991afafc7c11b926aeede507e67eb9 | REVIEW: no open PR; intent unknown |  |
| team | ce9882a3b453d92b91a60c5de8d456f47c16f6f5 | KEEP: base/board |  |
| windows-port | 1a00bd3b41a33b8762985d7df48c0d5e6a1dc5d3 | KEEP: base/board | #50 closed |
| zai/import-claude-skills | 94e9a16baa3b556d957fbfffa050520d797618d2 | MERGED: ancestry verified | #101 closed |
| zai/pairing-tailscale-states | 97a7ae45b52f6ee80cbb20a9a72d79619cb74274 | MERGED: ancestry verified | #100 closed |
| zai/task-60-cli-followups | 7f51edd4c762707dfb8077452343985e7ee3ccb5 | MERGED: ancestry verified | #113 closed |
| zai/task-89-red-tests | 36f9376cc7c9cb7ef29a193b361ab822444d97f7 | REVIEW: no open PR; intent unknown | #118 closed |
| zai/task-90-ci-coverage | 19b1a0bea55d7719d6a3aba2fc2533f159dda829 | REVIEW: no open PR; intent unknown |  |
| zai/usage-nits-76 | 95a3c1fd7b42046536240c09ee1eb7ae6e63de8d | REVIEW: no open PR; intent unknown | #112 closed |
