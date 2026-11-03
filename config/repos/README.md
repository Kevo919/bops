# Repo recipes

Each file here, `config/repos/<id>.yaml`, describes one starter GitHub repo that the owner and the bots
can Open or Run on a bot's Linux cloud computer (Ubuntu, Node and Python available, root, network).
The app's Repos section and the bots' `run_repo` tool read these files. `schema.json` is the JSON Schema
for one recipe, and `node scripts/test-repo-recipes.mjs` checks every recipe against it (it also runs in
Fork CI).

## How a runner uses a recipe

1. Make a working folder, for example `~/repos`, and run `clone` there. The clone lands in `<id>/`.
2. Export `env` (plain, non-secret settings) and any keys the owner has provided under the names in
   `keys_required` / `keys_optional`.
3. Run each `install` command in order, inside the clone. Stop at the first non-zero exit.
4. Run `run` inside the clone (one command, or a list run in order). When `background: true`, start the
   last command detached with a time limit, keep its output, and go on to the health check.
5. Health: `http` means poll that URL until it answers with `expect` (allow a few minutes for a first
   start); `cmd` means run it inside the clone and compare the exit code with `expect_exit`.
6. Stop what you started (kill the process group, or `docker stop` for Docker recipes).

Every command runs with the clone as its working directory, so a command that starts with `cd sub && …`
only affects that command.

## Fields

| Field | Meaning |
| --- | --- |
| `id` | Lower-case, dashes; must equal the file name. Unique. |
| `name`, `what`, `good_for` | Display name, one plain sentence, and a few words. |
| `repo`, `url` | `owner/name` and `https://github.com/owner/name`. |
| `private`, `needs_token` | For private repos: `private: true` and the env var NAME of a token that can clone it. |
| `license`, `license_note` | SPDX id or `custom: …`; the note flags AGPL, SSPL, fair-code, non-commercial data and similar. Empty string when there is nothing to flag. |
| `stack` | Main languages and tools. |
| `requirements` | `node: ">=x"`, `python: ">=x"` (optionally `,<y`), `docker: true/false`, `other: [...]`. |
| `keys_required`, `keys_optional` | Lists of `{name, for}`: env var NAMES with one line on what each is for. Never values. |
| `env` | Non-secret env vars the recipe needs (for example a data folder or an analytics opt-out). |
| `clone` | Usually `git clone --depth 1 <url>.git <id>`. |
| `install` | List of shell commands. Empty list when nothing is needed. |
| `run`, `background` | One command or a list; `background: true` for a long-running server. |
| `kind` | `web`, `cli`, `mcp` or `library`. |
| `port` | Required for `web`; must match the health URL. |
| `health` | `{http: "http://127.0.0.1:PORT/…", expect: 200}` or `{cmd: "… --help", expect_exit: 0}`. |
| `fits_bot_computer`, `fits_reason` | Whether it suits a bot computer, and why (size, Docker, root caveats). |
| `verified` | Either `false` (then `verified_reason` says why), or `{date, by, commit, steps, notes}`. |

`verified.steps` has `clone`, `install`, `run` and `health`, each one of `pass`, `pass: <detail>`,
`fail: <first error line>` or `skipped: <why>`. Only record `pass` for a step you actually ran and saw
succeed, and for health only when the check itself was seen to pass. `commit` is the short commit
that was tested.

## Rules the validator enforces

- Every recipe matches `schema.json`; unknown fields are rejected.
- No secrets: anything that looks like a key, token, private key, JWT, credentials in a URL, or a
  `SECRET_NAME=literal` assignment is rejected. Use `$NAME` references in commands.
- Every URL is `https://`; plain `http://` is allowed only for `127.0.0.1` / `localhost` health checks.
- `id` is unique and matches the file name; `url` matches `repo`; `clone` clones `url`.
- `web` recipes have a `port`; `verified: false` has a `verified_reason`; `private` has `needs_token`.

## Adding a recipe

Read the repo's README and LICENSE from a fresh clone, then run the steps for real in a scratch folder
(never inside this repo), with a time limit on anything long-running. Record what actually happened,
including failures with the first error line, then run `node scripts/test-repo-recipes.mjs`.

Private repos (`private: true`) use `clone: "broker-tarball: owner/repo …"`: Bops' server fetches a pinned tarball through its key broker with the named token, and unpacks it on the bot's computer. The token never reaches the computer, a URL, `.git/config` or a log. Git credential helpers are refused.
