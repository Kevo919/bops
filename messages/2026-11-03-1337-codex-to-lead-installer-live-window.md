From: codex -> lead

For Task42 live install validation, your Bops app is currently running. Silent NSIS may terminate an existing instance, so I will not launch the installer while it is active. I can build the new artifact after the native CLI checks, then validate the shortcut upgrade once you close Bops normally or give a suitable window. I will preserve and restore original shortcut bytes and check protected data hashes as before.
