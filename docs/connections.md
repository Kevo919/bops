# Connect Composio, Zapier and OpenRouter

Bops can use four outside accounts of yours. Each one is set up the same way: you get a key (or, for Zapier, a server address) from the service, paste it into `.env.local` on the computer that runs Bops, restart Bops, and press **Check** in **Settings → This Mac → Connections**.

| Connection | What it gives your bots | What goes in `.env.local` | Where to get it |
| --- | --- | --- | --- |
| Composio | Your apps: Gmail, Slack, Notion, Google Sheets and about 1,000 more | `COMPOSIO_API_KEY=` | [composio.dev](https://composio.dev) |
| Composio (your account) | The apps you already connected yourself in Composio's For You area | `COMPOSIO_MCP_URL=` and, if shown, `COMPOSIO_MCP_KEY=` | Composio, For You, Connect my agent |
| Zapier | The Zapier actions you pick, in your own chats | `ZAPIER_MCP_URL=` | [mcp.zapier.com](https://mcp.zapier.com) |
| OpenRouter | Hundreds of AI models for chats and bots, some free | `OPENROUTER_API_KEY=` | [openrouter.ai/keys](https://openrouter.ai/keys) |

## Before you start: where `.env.local` is

1. Open the Bops folder on your PC or server (the one you installed Bops from).
2. If there is no file named `.env.local`, copy `.env.example` and name the copy `.env.local`. Never replace an existing `.env.local`.
3. Open `.env.local` in a text editor (Notepad is fine). Each setting is one line: `NAME=value`, with no spaces around `=` and no quotes. Keep one line per name.
4. After you change it, save the file and restart Bops. On Windows, closing the window leaves Bops running in the tray: right click the tray icon, quit, then open Bops again. On a server, restart the Bops service.

`.env.local` is never put on GitHub. Keep it private anyway: never paste these keys into a chat, a screenshot, an issue or a pull request. If one leaks, delete it at the service and make a new one.

## Composio (connected apps)

Composio keeps the logins to your apps. Bops never sees your app passwords; it only asks Composio to act for you.

1. Go to [composio.dev](https://composio.dev) and sign up or sign in.
2. Open **Settings → Project Settings** and copy the project key under **API Keys**. It starts with `ak_`.
3. In `.env.local`, add `COMPOSIO_API_KEY=ak_your_key`. You need `BOPS_SELF_HOSTED=1` there too (it's already there if you set Bops up as self hosted). `COMPOSIO_USER_ID=` is optional: leave it out unless you share one Composio project between several Bops installs and want them to share accounts.
4. Restart Bops. In **Settings → This Mac → Connections**, the Composio row shows **Set**. Press **Check**: **Working** means Composio accepted the key.
5. Press **Connected apps … in Logins** on that row (or open **Settings → Logins**). Pick an app, for example Gmail, Slack, Notion or Google Sheets, choose which bots may use it, and press **Connect**.
6. The app's own sign in page opens in your browser (on Windows, from the Bops window; if nothing opens, allow pop ups for Bops and press **Try again**). Sign in and allow access. When you see "connected", go back to Bops: the account shows in Logins.
7. Ask a bot in its chat, for example "find my latest email from Sam" or "add a row to my Leads sheet". Reading runs at once. Anything that sends, creates, changes or pays shows you a request first, with what it will do; nothing happens until you say yes.

## Composio (your account)

Use this when you connected Gmail, Google Drive or other apps in Composio's **For You** area. The Composio row above uses a Platform project key (`ak_...`), and a project only sees the apps connected inside that project, so it can't see the ones you connected in For You.

1. In Composio, open **For You**, then **Connect my agent**.
2. Copy the address it shows. Composio's docs give it as `https://connect.composio.dev/mcp`.
3. If the page also shows a key (it starts with `ck_`; it is also under For You, **Settings, Sessions & API Key**), copy that too. Bops sends it as the `x-consumer-api-key` header, only to that address.
4. In `.env.local`, add `COMPOSIO_MCP_URL=` followed by the address, and, if you have one, `COMPOSIO_MCP_KEY=` followed by the key. Restart Bops and press **Check**: it lists the tools and apps Composio offers.

Bops only uses an address that starts with `https://` and is on `connect.composio.dev`, and refuses a Platform key (`ak_`) here. Like Zapier, it is offered only in your own chats in the Bops app. Reading runs right away; anything that sends, changes, deletes or pays asks you first, and so does running code in Composio's sandbox or changing your connections. The key never leaves this computer's `.env.local`: Settings shows only the host and that a key is saved.

## Zapier

Zapier gives each person an MCP server: a private address with the actions you chose (for example "Gmail: Send Email" or "Google Sheets: Create Row"). Bops talks to that server directly.

1. Go to [mcp.zapier.com](https://mcp.zapier.com) and sign in with your Zapier account.
2. Make a new MCP server. When it asks which client, pick **Other** (any client that speaks MCP over Streamable HTTP).
3. Add the actions you want your bots to have, and connect the Zapier accounts they need. Fewer actions is better: each one becomes a tool your bot can see.
4. Open the server's **Connect** (or **Settings**) tab and copy the **server URL** that has the token in it. It looks like `https://mcp.zapier.com/api/v1/connect?token=…` (older servers look like `https://mcp.zapier.com/api/mcp/s/…/mcp`). This address is a password: anyone who has it can run your actions.
5. In `.env.local`, add `ZAPIER_MCP_URL=` followed by the whole address. Bops only uses an address that starts with `https://` and is on `zapier.com`; anything else is refused before anything is sent.
6. Restart Bops. In **Settings → This Mac → Connections**, press **Check** on the Zapier row. **Working** says how many actions your server has.
7. In your own chat with a bot in the Bops app, ask for something one of the actions does. An action Zapier marks as read only runs at once. Every other action asks you first, showing its inputs; it runs only when you say yes. You can choose **Always allow** for one you trust.

Where Zapier is offered, on purpose: only your own chats in the Bops app. It is not offered to team members, in Telegram, Discord or Slack, by text or email, in routines, or on the bots' cloud computers. What Zapier sends back is treated as information from outside Bops, never as instructions, and very long answers are cut short. The address never leaves this computer's `.env.local`: it isn't saved in Bops' data, shown in the window, written to logs, or given to a bot.

If you change actions at mcp.zapier.com, Bops picks them up within about five minutes, or straight away after **Check**.

## OpenRouter

OpenRouter is one key for hundreds of models. Some are free: their ids end in `:free`.

1. Go to [openrouter.ai/keys](https://openrouter.ai/keys), sign in, and create a key. Give it a **credit limit**, so it can't spend more than you want. It starts with `sk-or-v1-`.
2. In `.env.local`, add `OPENROUTER_API_KEY=sk-or-v1-your_key`.
3. Restart Bops. In **Settings → This Mac → Connections**, press **Check** on the OpenRouter row.
4. Add a model in **Settings → This Mac → Models**: **Add a model → OpenRouter**, then search, for example `free` or `llama`. A free model's id ends in `:free`, like `meta-llama/llama-3.3-70b-instruct:free`. Then pick it in a chat's model box by the Send button.

Free models, in plain words:

- They have a daily limit (a small number of requests a day; more once your account has bought some credit) and can be busy. Bops says so when that happens; wait and try again, or pick another model.
- Many need a privacy setting: at [openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy), allow free endpoints that may train on or publish your prompts. Without it, Bops says the model has no provider your privacy settings allow.
- Many can't use tools. Bops then asks the model again without them, so it still answers, but it can't look things up, use your apps or Zapier in that chat. Pick a paid model for that.
- **Check** may say "no credit" for a key with no credit left. Free models may still work with it.

More about OpenRouter keys and spending limits: [docs/keys.md](keys.md#8-openrouter--openrouter_api_key).

## What Check tells you

- **Not set up yet**: the line isn't in `.env.local`, or Bops wasn't restarted after you added it.
- **Set. Press Check**: Bops found a value; it hasn't been tried yet.
- **Working**: the service accepted it just now.
- **Not working**: the service turned the key or address down. Copy it again from the service, paste it, restart.
- **Couldn't check it right now**: the service didn't answer, or took too long. This doesn't mean the key is wrong; try again later.

Check sends one request to that service, only when you press it. Only the result comes back to the window, never the key or the address.
