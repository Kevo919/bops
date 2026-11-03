# PR33 and PR37 base updates

Actor: Codex subagent, delegated under REQ-20261103-codex-deploy. Parent retains merge/deploy ownership.

Both existing PR branches now include fork/windows-port at 0d9eea3 by normal merge, with no rebases/force pushes. Only conflict was .gitleaksignore: the current base includes both existing exact branch fingerprints plus the reviewed PR43 fixtures, so retained the base's superset. No feature code conflicts.

- PR33 https://github.com/Kevo919/bops/pull/33 head 2db484a5736e89358a53510022eed118b33c6ee4. node scripts/test-windows-installer.mjs node_modules/app-builder-lib/templates/nsis: 9 passed, no installer/app launched.
- PR37 https://github.com/Kevo919/bops/pull/37 head 235507c5ed522879dcd9ea209de69995b5844b4e. node --conditions=react-server scripts/test-local-subscriptions.mjs: 15 passed. node scripts/test-subscriptions-ui.mjs: 19 passed (5 cloud, 7 local each harness mode). Initial backend invocation without server condition failed as expected; corrected invocation passed.
- git diff --check clean on both branches. GitHub reports mergeable=true for both; newly triggered web/android/check/cloud-tests still running at this check. Parent must wait for current-head CI before merging.

Not verified: full local matrix, installer operation, live CLI account sign-in, browser rerun. Parent holds the heavy-build lock for VPS deployment. No new features, no auth/model calls, no PR merges performed.
