# Signing key (encrypted)

`android-signing.p12.enc` is the one permanent key that signs every Bops phone and watch APK, so each new build installs over the last (Android only accepts an update signed with the same key) and the watch app can talk to the phone app.

- It is **AES-256 encrypted** (`openssl enc -aes-256-cbc -pbkdf2 -iter 600000`). Without the password it is useless.
- The password lives only in the repo secret **`ANDROID_SIGNING_PASSWORD`** (and with the owner). CI decrypts the key into a temp file, signs, and deletes it.
- Alias: `kevo-apps`. The certificate fingerprint is printed in each build's log (Check the APK).
- **Made by CI, not by a person:** the first build that finds the `ANDROID_SIGNING_PASSWORD` secret and no key here creates the key on GitHub's runner, encrypts it with that password, and commits only the encrypted file. Nobody, including the agents, ever sees the unencrypted key or the password. The same encrypted file is copied to Kevo919/J.a.r.v.i.s, so both projects share one key (same password secret there).
- Never commit the decrypted `.p12` or the password. To rotate: make a new key, re-encrypt, replace the file and the secret. Every installed app then needs one uninstall + reinstall.
