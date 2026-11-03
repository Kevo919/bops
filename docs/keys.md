# Set up your provider keys

This guide covers the eight keys, plus the free Ollama setting, shown in **Settings → This Mac → Keys** when you run your own Bops server. A key is a password that lets Bops use your provider account. Only configure the providers you use. Provider API usage and cloud computers can cost money; a chat-app subscription does not automatically include API credits.

## Put keys on the machine running Bops

1. Open the Bops repository folder on your PC or server. If `.env.local` does not exist, copy `.env.example` to `.env.local`. Do not replace an existing `.env.local`.
2. Open `.env.local` in a text editor. For each provider below, replace the value on its existing line, or add the line if absent: `KEY_NAME=your_key_here`. Replace the placeholder with the complete key, without spaces around `=`. Keep only one line for each key.
3. Save the file and restart Bops. On Windows, closing its window leaves it running: use the Bops tray menu to quit, then reopen it. Restart the Bops service if it runs on a server.
4. In the desktop Bops window, open **Settings → This Mac → Keys**. **set** means a nonempty value was found, not that the provider accepted it. Click **Check** beside a key to check it explicitly. This screen reads and checks keys; it does not save or edit them. Paired phones cannot use the key-check API.

`.env.local` is ignored by this repository's Git rules. Keep it private anyway: never paste real keys into chats, screenshots, issues, pull requests or documentation. If a key is exposed, revoke it at the provider and create a replacement. Do not put keys in `config/llms.yaml`; that file contains model settings.

**Check can cost a small amount:** the two OpenAI checks generate at most one output token, with a small input prompt, to test usable access. Other checks request model lists or account/key information. A successful metadata check proves access to that endpoint, not that every model has credits or permissions. **unavailable** may mean a timeout, service problem or unsupported check; it does not prove the key is invalid. **rate limited** is different from **no credit**.

The prefixes below are recognition hints from official examples, not validation rules. Copy the entire secret supplied by the provider; never add a prefix yourself.

## 1. OpenAI — `OPENAI_API_KEY`

1. Sign in to the [OpenAI API keys page](https://platform.openai.com/api-keys), choose the project for Bops, and create a new secret key.
2. Copy the secret into `OPENAI_API_KEY=` in `.env.local`. The official [OpenAI example](https://developers.openai.com/cookbook/examples/agents_sdk/session_memory) uses `sk-proj-…`.
3. Open organization settings, select the project, then **Limits**. Set a monthly spend limit and alerts. Turn on **Enforce a hard limit** if you want requests to stop when tracked spending reaches the limit. Alerts alone only notify you; enforcement can slightly overshoot because it is not instantaneous. See [OpenAI's project and spending instructions](https://help.openai.com/en/articles/9186755-managing-projects-in-the-api-platform).

This key supports Bops' OpenAI features, including chat and calls. Check your API billing separately from your ChatGPT subscription.

## 2. OpenAI for tasks — `OPENAI_EXECUTOR_API_KEY`

1. Use the same [OpenAI API keys page](https://platform.openai.com/api-keys) to create a second key for the bots' computer/Codex tasks. This is an ordinary OpenAI API key, not a separate provider product.
2. Put it in `OPENAI_EXECUTOR_API_KEY=`. Its prefix example is also `sk-proj-…`.
3. Give it only the permissions its tasks need. Set spending controls using the OpenAI instructions above. A separate project lets you give tasks their own project spend limit; two keys in the same project share that project's limit.

The repository supports keys from the same project, but a separate task key makes revocation and access management easier. Do not substitute a ChatGPT login token.

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

## After setup

Restart Bops, check the configured keys in **Settings → This Mac → Keys**, then select the corresponding provider/model in Bops. Keep spending alerts enabled where available, but use an enforced cap when you need requests to stop. Rate limits control request speed; they are not spending budgets.

## Adding models

Once a key is set, add the provider's models in **Settings → This Mac → Models** (right under Keys). No file editing or restart is needed.

1. **Add a model** → pick a provider. For **OpenRouter (hundreds of models)**, search its list (for example `qwen coder` or `deepseek`) and click one: the id and a name are filled in, with its price per million tokens. If OpenRouter's list can't be reached, type the id from [openrouter.ai/models](https://openrouter.ai/models), such as `qwen/qwen3-coder-next`.
2. **Use for**: pick the kinds of work it takes (Coding, Planning, Thinking, Research, Writing, Web tasks). Each job belongs to one model, so picking a job another model has moves it, and the card says which one it came from. A new thread about that kind of work starts on this model unless you pick another.
3. **Run by**: the agent that runs it on your bots' computers. OpenCode is the default; DeepSeek Harness runs every provider too. Claude Code and Codex run on an account you connect in a bot's AI section, so they can't be picked here.
4. **Default for new chats**: chats made from then on start on this model (while its key is set; otherwise Auto, OpenAI). Chats you already have keep their model, and **Auto (OpenAI)** can always be picked again in a chat's model box. **Default for bot tasks**: what new bots start on.

Each row shows whether its provider's key is set on this server (green) or not yet (amber, naming the key). Saving writes `config/llms.yaml`, keeping its comments. That file is tracked by git, so your changes show up as local edits there (`git status`), and an update that also changes it may ask you to keep or merge yours; you can still edit that file by hand (restart Bops after). Bots you have set up in their own AI section keep their own setup.

Provider links and instructions were checked against public official sources on 2026-11-03. Account pages may show a sign-in or JavaScript app shell; that does not verify the controls inside your account. Providers may change their screens, prefixes, prices and billing rules.
