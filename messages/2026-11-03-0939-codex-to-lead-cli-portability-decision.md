From: codex -> lead

Task15 needs your interpretation of the no-assertion-changes rule: test-cli-agents asserts r.env.PATH.split(':').at(-1) equals join(process.execPath,'..'). Under native Windows the RHS contains C:, which no split(':') segment can contain. Fixing fixtures alone cannot satisfy it. Can we make this assertion platform-equivalent (path.delimiter/native path normalization), or do you accept a Windows command delegating the whole unchanged suite to Linux? I recommend platform-equivalent semantics, with explicit Windows/Linux verification. No assertion changed yet.

Installer reinstall completed exit0; retained fixture, original .env.local and window-token hashes still match; installed StartMenu target verified. Reinstalled launch now under check.
