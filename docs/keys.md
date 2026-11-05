# Set up your provider keys

This guide covers the provider keys and free Ollama setting shown in **Settings → This PC → Keys** on Windows (**This Mac** on macOS) when you run your own Bops server. A key is a password that lets Bops use your provider account. Only configure the providers you use. Provider API usage and cloud computers can cost money; a chat-app subscription does not automatically include API credits.

## Put keys on the machine running Bops

1. Open the Bops repository folder on your PC or server. If `.env.local` does not exist, copy `.env.example` to `.env.local`. Do not replace an existing `.env.local`.
2. Open `.env.local` in a text editor. For each provider below, replace the value on its existing line, or add the line if absent: `KEY_NAME=your_key_here`. Replace the placeholder with the complete key, without spaces around `=`. Keep only one line for each key.
3. Save the file and restart Bops. On Windows, closing its window leaves it running: use the Bops tray menu to quit, then reopen it. Restart the Bops service if it runs on a server.
4. In the desktop Bops window, open **Settings → This PC → Keys** on Windows (**This Mac** on macOS). **set** means a nonempty value was found, not that the provider accepted it. Click **Check** beside a key to check it explicitly. This screen reads and checks keys; it does not save or edit them. Paired phones cannot use the key-check API.

`.env.local` is ignored by this repository's Git rules. Keep it private anyway: never paste real keys into chats, screenshots, issues, pull requests or documentation. If a key is exposed, revoke it at the provider and create a replacement. Do not put keys in `config/llms.yaml`; that file contains model settings.

**Check can cost a small amount:** the two OpenAI checks attempt a generation of at most one output token, with a small input prompt. Other checks request model lists or account/key information. A successful check proves only access to that endpoint; neither a model-list response nor a generation verifies executor registration. The current executor Check uses the wrong kind of endpoint for a restricted environment key: it may report **unavailable** even when that key can connect an executor. Verify it with an actual task as described below. **unavailable** may also mean a timeout or service problem; it does not prove the key is invalid. **rate limited** is different from **no credit**.

The prefixes below are recognition hints from official examples, not validation rules. Copy the entire secret supplied by the provider; never add a prefix yourself.

## 1. OpenAI — `OPENAI_API_KEY`

1. Sign in to the [OpenAI API keys page](https://platform.openai.com/api-keys), choose the project for Bops, and create a new secret key.
2. Copy the secret into `OPENAI_API_KEY=` in `.env.local`. The official [OpenAI example](https://developers.openai.com/cookbook/examples/agents_sdk/session_memory) uses `sk-proj-…`.
3. Open organization settings, select the project, then **Limits**. Set a monthly spend limit and alerts. Turn on **Enforce a hard limit** if you want requests to stop when tracked spending reaches the limit. Alerts alone only notify you; enforcement can slightly overshoot because it is not instantaneous. See [OpenAI's project and spending instructions](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform).

This key supports Bops' OpenAI features, including chat and calls. Check your API billing separately from your ChatGPT subscription.

## 2. OpenAI for tasks — `OPENAI_EXECUTOR_API_KEY`

1. Sign in to OpenAI Platform and open [Agents → Environments → Keys](https://platform.openai.com/agents?environment_view=keys&tab=environments). Select **Create** to make a dedicated environment key. This key needs `api.agents.environments.connect`; creating another ordinary API key does not supply it.
2. Use the **same owner, organization and project** as the application key in `OPENAI_API_KEY`. Do not put the executor in a separate project. If your organization restricts outbound IP addresses, its rules must allow the computer running the executor. See [OpenAI's executor setup instructions](https://developers.openai.com/cookbook/examples/agents_api/apps/slack_bot/readme).
3. Save the full environment key as `OPENAI_EXECUTOR_API_KEY=` in `.env.local`, then restart Bops. Bops passes it to its executor as `CODEX_API_KEY`; it must remain separate from the application key. An environment key only authorizes environment connections, not model-list or generation calls. See [OpenAI's credential separation guide](https://developers.openai.com/api/docs/guides/agents-api/environments/security).
4. Check the application's API credit and spending controls, then run a small task on **Your PC**, such as calculating `17 × 23` with no file changes. Confirm the task completes and reports its result; a working chat reply or a green Keys check is not proof that the executor connected.

If registration fails with `403 missing required scope api.agents.environments.connect`, check that the executor has the dedicated environment key, not a general API key. This is the cause described in [OpenAI's troubleshooting guide](https://developers.openai.com/cookbook/examples/agents_api/sandboxes/databricks/readme).

Local Claude Code and ChatGPT subscription sign-ins currently connect their accounts only; Bops does not use them to run tasks on this Windows PC. Subscription tasks run on a bot's cloud computer instead. Do not copy a ChatGPT or Claude login token into either API-key setting.

## 3. Orgo computers — `ORGO_API_KEY`

1. Open [Orgo setup](https://www.orgo.ai/start), sign in, and create an API key for your account. Orgo's [official documentation index](https://docs.orgo.ai/llms.txt) links this setup page and identifies keys beginning with `sk_live_`.
2. Put the full key in `ORGO_API_KEY=`. This is for self-hosting with `BOPS_SELF_HOSTED=1`; the app's normal Orgo sign-in is a separate path.
3. Review [Orgo's current plans and pricing](https://www.orgo.ai/#pricing) before creating computers. Select the capacity you need and stop unused metered computers in Orgo. Hourly computers and subscription plans have different billing rules; stopping a computer is not a promise that a subscription charge ends.

No configurable account spending cap or alert setting was verified in the public documentation. Do not assume an AI-provider budget limits Orgo computer charges.

## 4. Anthropic / Claude — `ANTHROPIC_API_KEY`

1. Sign in to the [Claude Platform API keys page](https://platform.claude.com/settings/keys) and create a key. Follow the [official key setup guide](https://platform.claude.com/docs/en/get-api-key) if you need to set up an API account first.
2. Put it in `ANTHROPIC_API_KEY=`. The official example begins `sk-ant-api03-…`; use an API key, not a Claude subscription/session token.
3. Open [Billing](https://platform.claude.com/settings/billing), find **Spend limits**, and set or adjust your limit. Organization/workspace spend limits reject further usage when reached. Review the [official spend-limit rules](https://platform.claude.com/docs/en/api/rate-limits) and any automatic credit reload settings before enabling unattended tasks.

Claude API billing is separate from a Claude chat subscription.

## 5. Z.ai — `ZAI_API_KEY`

1. Sign in to [Z.ai API key management](https://z.ai/manage-apikey/apikey-list). For the standard API, create a **Standard API Key**, as described in the [quickstart](https://docs.z.ai/guides/overview/quick-start).
2. Put it in `ZAI_API_KEY=`. No stable prefix was verified in the official documentation; copy the complete key as issued.
3. Review [billing and top-ups](https://z.ai/manage-apikey/billing) and [current pricing](https://docs.z.ai/guides/overview/pricing). Start with a small top-up and monitor usage. The standard API rejects requests for insufficient balance; no general standard-API monthly cap setting was verified.

Bops uses this variable for both `zai` and `zai-coding` routes. **GLM Coding Plan is a separate product with a dedicated endpoint and usage limits**; make sure the selected route matches your key's product. Its extra-usage spending limits are not the same as standard API balance. See the quickstart and [documented balance/plan errors](https://docs.z.ai/api-reference/api-code). Do not assume a Coding Plan subscription pays for every standard API call.

## 6. Z.ai Coding Plan (China) — `ZAI_CODING_CN_API_KEY`

1. Sign in to [open.bigmodel.cn](https://open.bigmodel.cn) with the account that holds your GLM Coding Plan for the China region, open **API keys**, and create a key for Bops.
2. Put it in `ZAI_CODING_CN_API_KEY=`. No stable prefix was verified; copy the complete key as issued.
3. Bops uses this variable only for the `zai-coding-cn` route, which sends requests to `https://open.bigmodel.cn/api/coding/paas/v4` (OpenAI-compatible chat completions), the China-region counterpart of `zai-coding`. A key from z.ai does not work here, and this key does not work on the `zai` or `zai-coding` routes.

The **Check** button for this key requests the model list at `open.bigmodel.cn/api/paas/v4/models`; **unavailable** there does not prove the key is invalid. A plan without balance answers chat requests with z.ai's code `1113`, which Bops reports as no balance or Coding Plan. The open.bigmodel.cn pages, plan quotas and billing for the China region were not checked for this guide.

## 7. DeepSeek — `DEEPSEEK_API_KEY`

1. Sign in to [DeepSeek API keys](https://platform.deepseek.com/api_keys) and create a key. This is the key-management link supplied by the [official API documentation](https://api-docs.deepseek.com/).
2. Put it in `DEEPSEEK_API_KEY=`. No stable prefix was verified in the official documentation.
3. Check your balance and add only the funds you want to use through [Top up](https://platform.deepseek.com/top_up). [Pricing](https://api-docs.deepseek.com/quick_start/pricing/) explains that charges deduct from granted or topped-up balance; [error documentation](https://api-docs.deepseek.com/quick_start/error_codes/) confirms requests fail when the balance runs out. No configurable monthly spending cap was verified.

The official key and top-up pages loaded DeepSeek's sign-in screen in a browser. Their authenticated controls were not inspected.

## 8. OpenRouter — `OPENROUTER_API_KEY`

1. Sign in to [OpenRouter keys](https://openrouter.ai/settings/keys) and create a key for Bops.
2. Put it in `OPENROUTER_API_KEY=`. The [official tutorial](https://openrouter.ai/blog/tutorials/image-generation/) illustrates `sk-or-v1-…`.
3. Set a **credit limit on this key**. Requests are rejected when it is exhausted, until you increase it or its configured daily/weekly/monthly reset occurs. An unlimited key can consume your entire account balance, including automatic top-ups. See [OpenRouter's key-limit instructions](https://openrouter.ai/docs/api_reference/authentication).

Choose models with prices you are comfortable paying and review account top-up settings as well as the key limit.

## 9. Ollama (free, local) — `OLLAMA_BASE_URL`

Ollama runs open models on your own server, so chats on it cost nothing and need no account or key. Use it when you want a free model for everyday chat; small models are slower and less capable than the paid ones above.

1. Install Ollama on the server that runs Bops and pull a model, for example `ollama pull qwen2.5:3b`.
2. Put Ollama's address in `OLLAMA_BASE_URL=`, ending in `/v1` (Ollama's OpenAI-compatible API). The usual address is `http://127.0.0.1:11434/v1`; use whatever port your install listens on.
3. Restart Bops. The chat model menu by the Send button now shows **Ollama (free, local)**. Without `OLLAMA_BASE_URL` it doesn't show at all.
4. Optional: `OLLAMA_API_KEY=` only if your Ollama sits behind a proxy that wants a key; Bops sends it as `Bearer`. Plain Ollama needs none.

To use other Ollama models, add them to `config/llms.yaml` with `provider: ollama` and the model name exactly as `ollama list` shows it (for example `qwen2.5:3b`). Ollama is for chats only: bots' agents run on cloud computers that can't reach your server's Ollama. An Ollama chat can't search the web or see images. If a small model can't use tools, Bops asks it again without them, so it can still answer but can't look things up for you.

**Check** for this row asks Ollama for its model list at `OLLAMA_BASE_URL/models`. **works** with zero models means Ollama is running but you still need to pull one.

## Composio, Zapier and OpenRouter

**Settings → This PC → Connections** on Windows (**This Mac** on macOS) (below Models) has a row each for Composio (`COMPOSIO_API_KEY`, your connected apps), Zapier (`ZAPIER_MCP_URL`, your Zapier MCP server's address) and OpenRouter (`OPENROUTER_API_KEY`), with where to get each and a **Check** button. They also show in the Keys list. Step by step, including connecting Gmail or Slack and using OpenRouter's free models: [Connect Composio, Zapier and OpenRouter](connections.md).

## After setup

Restart Bops, check the configured keys in **Settings → This PC → Keys** on Windows (**This Mac** on macOS), then select the corresponding provider/model in Bops. Keep spending alerts enabled where available, but use an enforced cap when you need requests to stop. Rate limits control request speed; they are not spending budgets.

## More than one account for a provider

You can keep as many keys as you like for the same provider (a work and a personal OpenAI key, two OpenRouter keys, several z.ai accounts). They stay in `.env.local` only:

- The provider's **default account** keeps its usual name, for example `OPENROUTER_API_KEY=...`.
- Each **other account** is that name, two underscores, then a label of capital letters, numbers and `_` (at most 24), for example `OPENROUTER_API_KEY__WORK=...` or `OPENAI_API_KEY__PERSONAL=...`.

Restart Bops after changing `.env.local`. Each account then has its own row and **Check** button in **Keys** (shown as "OpenRouter (work)"), and in **Models** each model of that provider gets an **Account** box: pick which account its chats (and chat routines) use. Bops never shows a key's value, only whether it's set. In `config/llms.yaml` this is `account: work` on that model. If a model names an account that isn't in `.env.local` (removed, or a typo), the card says **account not found** and its chats say which line to add.

For now, bots' tasks on their computers (OpenCode, DeepSeek Harness) still use the provider's default account.

## Adding models

Once a key is set, add the provider's models in **Settings → This PC → Models** on Windows (**This Mac** on macOS; right under Keys). No file editing or restart is needed.

1. **Add a model** → pick a provider. For **OpenRouter (hundreds of models)**, search its list (for example `qwen coder` or `deepseek`) and click one: the id and a name are filled in, with its price per million tokens. If OpenRouter's list can't be reached, type the id from [openrouter.ai/models](https://openrouter.ai/models), such as `qwen/qwen3-coder-next`.
   For OpenRouter you can also pick, in the same place:
   - **One of your presets**: a preset is a model with your own instructions and settings, which you make at [openrouter.ai/settings/presets](https://openrouter.ai/settings/presets). Bops lists your presets using your `OPENROUTER_API_KEY` (the key stays on this computer; only each preset's name goes to the window). Click one. Only if Bops can't read your list (no key yet, the key is turned down, or OpenRouter can't be reached) does it ask you to type the preset's slug (the part after `@preset/`). It is saved as `@preset/<slug>` and shows as **Preset: <name>** in the model boxes. A preset runs chats and chat routines only: your bots' agents need a plain model id, so it takes no Use for, Run by or bot default.
   - **Any model id**: any OpenRouter model id, such as `vendor/model` or `vendor/model:free`. If OpenRouter's list (as Bops last read it) doesn't have that id, Bops saves it and says so, so you can check it.
   - **Auto Router**: one click adds `openrouter/auto`, which lets OpenRouter pick a model for each message.
2. **Use for**: pick the kinds of work it takes (Coding, Planning, Thinking, Research, Writing, Web tasks). Each job belongs to one model, so picking a job another model has moves it, and the card says which one it came from. A new thread about that kind of work starts on this model unless you pick another.
3. **Run by**: the agent that runs it on your bots' computers. OpenCode is the default; DeepSeek Harness runs every provider too. Claude Code and Codex run on an account you connect in a bot's AI section, so they can't be picked here.
4. **Default for new chats**: chats made from then on start on this model (while its key is set; otherwise Auto, OpenAI). Chats you already have keep their model, and **Auto (OpenAI)** can always be picked again in a chat's model box. **Default for bot tasks**: what new bots start on.

A model you add or change shows in each chat's model box right away (no reload). Each routine has a **Model** box too (open the routine, **Edit**): **Auto (as before)** keeps how it runs today. For a routine that runs as a chat, its run is on the model you pick (a preset too). For a routine that runs as a task on a bot's computer, the model is used when it's one of Your LLMs that the bot's OpenCode or DeepSeek Harness can run; a preset, an Ollama model or a built-in model can't run there, so the task runs as before.

Each row shows whether its provider's key is set on this server (green) or not yet (amber, naming the key). Saving writes `config/llms.yaml`, keeping its comments. That file is tracked by git, so your changes show up as local edits there (`git status`), and an update that also changes it may ask you to keep or merge yours; you can still edit that file by hand (restart Bops after). Bots you have set up in their own AI section keep their own setup.

The OpenAI environment-key instructions were rechecked against public official sources on 2026-11-05. Other provider links and instructions were checked on 2026-11-03. Account pages may show a sign-in or JavaScript app shell; that does not verify the controls inside your account. Providers may change their screens, prefixes, prices and billing rules.
