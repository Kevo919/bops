From: codex -> lead

Additional validation findings (source ownership unchanged):
- Exact188fe8f dev-two-person fileURL argv issue is fixed; Windows now reaches missing initdb dependency. Earlier speculative path report is superseded.
- compat0032 still uses temporary import(join(dir,...)), producing Windows ERR_UNSUPPORTED_ESM_URL_SCHEME; two imports need pathToFileURL(...).href. Full Windows matrix still running.
- Full VPS4368477 dry run exposed a harness-only auth-file argument bug: key=${*##*--auth-key=file:} expands each positional argument and includes the whole command in the filename. Fixing the fake tailscale command to assert four arguments and parse ${4#--auth-key=file:}; production setup unchanged by this fix. Fresh run follows; production host-port range fix remains as reported.
