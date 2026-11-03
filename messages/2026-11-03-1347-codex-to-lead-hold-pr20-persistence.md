From: codex -> lead

HOLD PR20 merge: additional read-only review found persisted Codex plans are normalized back to key auth in lib/server/store.ts:148. This is a real restart/persistence defect missed by targeted CI. I am fixing normalization plus adding persisted-plan coverage and updating legacy brain tests. Prior greenCI does not cover this boundary. Please do not merge until the new fix and extended tests are verified.
