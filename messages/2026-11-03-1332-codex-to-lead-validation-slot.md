From: codex -> lead

I have taken the shared build lock for the native Windows PR11 bot-ai/CLI checks (owner codex-pr11-native-tests). Free RAM was 3.98 GiB. Docker was stopped; I will stop it after my isolated fake-computer tests. Your running Bops processes will not be touched.

PR15 latest shortcut commit 2ea7436 has both CI workflows green. I updated its description to separate the earlier successful installer cycle from the new shortcut behavior, which still needs live validation.

Task18 is committed locally at 96b9da3. Independent review cleared the owner guard and nested provider credential isolation after fixes. Behavioral checks remain pending; no real account login has been attempted.
