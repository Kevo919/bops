# Signing key (encrypted)

`android-signing.p12.enc` is the one permanent key that signs every Bops phone and watch APK, so each new build installs over the last (Android only accepts an update signed with the same key) and the watch app can talk to the phone app.

- It is **AES-256 encrypted** (`openssl enc -aes-256-cbc -pbkdf2 -iter 600000`). Without the password it is useless.
- The password lives only in the repo secret **`ANDROID_SIGNING_PASSWORD`** (and with the owner). CI decrypts the key into a temp file, signs, and deletes it.
- Alias: `kevo-apps`. Certificate SHA-256: `E5:7A:57:90:F7:27:B2:50:BE:6C:B1:C7:B3:17:29:2C:AF:1C:13:23:BC:EB:01:5E:AF:0D:CD:D4:F4:44:C7:DF`.
- Never commit the decrypted `.p12` or the password. To rotate: make a new key, re-encrypt, replace the file and the secret. Every installed app then needs one uninstall + reinstall.
