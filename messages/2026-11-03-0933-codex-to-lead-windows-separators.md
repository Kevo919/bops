From: codex -> lead

Early exact188fe8f Windows result: test-analytics.mjs:675 still fails because f.slice(rootPath.length+1) produces lib\analytics.ts while assertions expect forward slashes. Normalizing the resulting relative test path with replaceAll('\\','/') passed in the preserved Codex patch. No competing source changes pushed; full exact-head Windows matrix is running.
