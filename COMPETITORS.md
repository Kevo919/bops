# Bops vs. the other AI agent apps

Researched on **November 5, 2026**. This page compares Bops (the `windows-port` branch of Kevo919/bops, with feature status from `team/TESTS.md` and `team/PROGRESS.md`) against the leading personal and business AI agent products. It ends with what Bops still lacks, ranked by how much each gap matters for running business ops, real estate and manufacturing work.

The other products change every few weeks, and most details come from news coverage and reviews of launches less than three months old. Where a source didn't cover a feature, the table shows **?** instead of a guess.

Key: ✅ has it · ⚠️ partial or limited · ❌ doesn't have it · ? unknown or not confirmed

---

## The competitors

**Meta Muse.** A personal AI agent from Meta, introduced in the US on September 8, 2026, and built on Meta's own Muse Spark model. It runs errands for you: sending emails, booking travel, shopping and making appointments. It works in a cloud virtual machine with a browser you can watch, and it asks before it sends messages or spends money. It has its own iOS and Android apps, a website and WhatsApp access, plus its own email address and shopping partnerships with Stripe and Shopify. At Meta Connect, Meta added a talking avatar and said Muse is coming to its smart glasses and to Macs. Pricing is Free, Power ($20/month) and Maximum ($100/month). Amazon has reportedly blocked it from shopping on Amazon. [Tech Insider](https://tech-insider.org/what-meta-actually-shipped-with-muse/), [Futureproof](https://futureproof.work/blog-posts/meta-muse-launches-ushering-in-the-era-of-always-on-consumer-ai), [CGM](https://www.cgmagonline.com/news/meta-connect-2026-all-big-announcements/)

**ChatGPT Dots (OpenAI).** Always-on agents that live inside ChatGPT, announced at OpenAI DevDay on September 29, 2026 and running on GPT-6 Astra. Each dot has a goal, its own memory and its own cloud computer and browser, so it keeps working with your laptop closed. Dots run recurring tasks, use more than 4,000 apps through plugins, can hand work to subagents and start Codex coding jobs, and can buy things with a card saved on a store's site after you approve. You can reach a dot in ChatGPT, in Slack or Teams, or by voice call. Texting is a limited US beta. You can't view or delete a dot's individual memories. Dots need ChatGPT Pro (from $100/month) or Business Premium, and the first dot is included. [Codersera guide](https://codersera.com/blog/openai-chatgpt-dots-guide-2026/), [BGR](https://www.bgr.com/2272332/openai-devday-2026-announcements/)

**Grok Bot (xAI / SpaceX, with Cursor).** A team of always-on bots, each working on a persistent cloud computer with a browser, files, a terminal and MCP tools. It started as a beta on August 11, 2026 and came out of beta on August 31. It has apps for Mac, Windows and iPhone, works in the terminal on Linux, and Android is promised. Bots run on schedules, sign in to websites that have no API, coordinate in group chats, learn by watching you work and save that as routines, and come back to you when they need a decision. It can now build, deploy and update apps. It has connectors for Gmail, Google Drive, Outlook, Teams, SharePoint and Salesforce, but no email, Slack or text channel to the bot. It comes with SuperGrok and Cursor's top plans, or about $200/month on its own. [Vellum](https://www.vellum.ai/blog/official-grok-bot-breakdown), [iGeeksBlog](https://www.igeeksblog.com/grok-bot-macos-ios-launch/), [Basenor](https://www.basenor.com/blogs/news/grok-bot-can-now-build-deploy-and-update-apps-autonomously)

**Claude (Anthropic): apps, Cowork, Dispatch and Claude Code.** Cowork is Claude's desktop agent. It works in your folders, uses your apps with permission, and connects to services through MCP connectors, plugins and skills. It makes real Excel (with formulas), PowerPoint and Word files, and there are Microsoft 365 add-ins. Scheduled tasks run only while your computer is awake and the app is open. Dispatch lets you hand work to your desktop from the Claude phone app. Claude Code covers coding. Plans run from Pro ($20) to Max. [Fast.io overview](https://fast.io/resources/claude-cowork-features-overview/), [Dispatch explainer](https://www.lowcode.agency/blog/claude-dispatch-explained)

**Google Gemini Spark (Gemini Agent).** Google's "24/7 personal agent", unveiled at I/O on May 19, 2026. It runs on dedicated cloud machines, does recurring and triggered tasks (for example, checking card statements for hidden fees), and works inside Gmail, Docs, Sheets and Drive. Live progress shows in Android's "Halo" view, and MCP support for apps like GitHub and Notion is rolling out. It started with trusted testers, then a beta for US Google AI Ultra subscribers. [Tom's Guide](https://www.tomsguide.com/ai/google-gemini/google-unveils-gemini-spark-a-24-7-personal-ai-agent-that-could-be-a-game-changer-for-agentic-ai), [9to5Google](https://9to5google.com/2026/05/06/gemini-agent-planner-upgrade/)

**Microsoft Copilot (Copilot Tasks and Agent Mode).** Copilot Tasks is a background agent on a virtual computer with a browser that can run tasks on a schedule. It is in limited preview with a waitlist. Agent Mode in Word, Excel and PowerPoint (generally available in 2026) edits your real Office files in place, and Copilot can read your Outlook, Teams and SharePoint data. [Windows Report](https://windowsreport.com/microsoft-introduces-copilot-tasks-to-turn-ai-into-an-autonomous-digital-worker/), [Microsoft Tech Community](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/agent-mode-general-availability/4488916)

**Manus.** A general-purpose agent that does long, multi-step jobs on its own cloud computer: research, slides and building websites. Its Mac and Windows app (March 2026) adds "My Computer", which runs commands on your own PC after you approve each one. Meta agreed to buy Manus in December 2025, and China blocked the deal in April 2026, but the product still runs. Pricing is credits: Free, then $20, $40 or $200 a month. [Codersera](https://codersera.com/blog/manus-ai-2026-status-meta-block-desktop-app/), [TechRadar](https://www.techradar.com/pro/meta-buys-manus-for-usd2-billion-to-power-high-stakes-ai-agent-race)

**Perplexity Comet.** An AI web browser with a built-in assistant that browses, fills in forms and sums up pages for you. The browser is free, and Max subscribers ($200/month) get a Background Assistant that runs several tasks at once while you do other things. It is strongest at research with sources. [TechCrunch](https://techcrunch.com/2025/10/02/perplexitys-comet-ai-browser-now-free-max-users-get-new-background-assistant/)

**Lindy.** A no-code builder for business agents: you describe one in plain English and it chooses from 1,000+ integrations. It can use a sandboxed browser and offers phone agents for booking appointments. Plans run from $29.99 to $199.99 per user each month, with no free plan. [Automation Atlas](https://automationatlas.io/answers/lindy-review-2026/)

**The open-source look-alikes you tried.**
- **OpenDots** and **OpenMuse** are both from CopilotKit and MIT-licensed. OpenDots gives specialist agents a computer, Spaces for documents, voice calls, Slack, schedules and memory ([ScriptByAI](https://www.scriptbyai.com/opendots-openai-dots-alternative/)). OpenMuse is an alpha template with inline cards, durable tasks and an iOS and Android app, but it still needs CopilotKit's hosted service ([review](https://andrew.ooo/posts/openmuse-review-copilotkit-open-source-personal-agent-meta-muse-alternative/)).
- **OpenTag** (amplifthq) sends @mentions in Slack, GitHub or Telegram to Codex or Claude Code, and nothing changes until you approve ([MCP Directory](https://mcp.directory/blog/opentag-agent-mention-gateways-2026)).
- **OpenBot**: I could not confirm a repo at `mandarwagh9/openbot`. The "OpenBot, Grok Bot alternative" I found is at `nightly-labs/openbot`, under a noncommercial license ([ChatGate](https://chatgate.ai/post/openbot-3)). It may be a different project from the one you used.

---

## Feature comparison

Column key: Muse = Meta Muse, Dots = ChatGPT Dots, Grok = Grok Bot, Claude = Cowork and Claude Code, Gemini = Gemini Spark, Copilot = Microsoft Copilot.

| Feature | Bops | Muse | Dots | Grok | Claude | Gemini | Copilot | Manus | Comet | Lindy |
|---|---|---|---|---|---|---|---|---|---|---|
| Chat with many model makers, your own keys | ✅ OpenRouter, Ollama, z.ai, OpenAI, Claude/ChatGPT plans, several accounts each | ❌ Meta only | ❌ OpenAI only | ❌ Grok only | ❌ Claude only | ❌ Gemini only | ⚠️ a few | ❌ | ⚠️ a few | ⚠️ a few |
| Agent on its own cloud computer and browser | ✅ one or more per plan, live view | ✅ | ✅ | ✅ shared by all bots | ⚠️ mostly your desktop | ✅ | ⚠️ preview | ✅ | ⚠️ browser only | ⚠️ browser |
| Agent on your own PC | ⚠️ works on Mac; Windows PC tasks fail sign-in today | ❌ Macs "coming" | ⚠️ optional | ✅ | ✅ | ⚠️ Android apps | ? | ✅ | ⚠️ browser | ❌ |
| Memory you can see and edit | ✅ SOUL.md, MEMORY.md, Honcho | ? | ⚠️ can't view or delete | ⚠️ no export | ✅ projects, CLAUDE.md | ✅ | ✅ | ⚠️ | ⚠️ | ? |
| Schedules and routines | ✅ cron, pause when away | ⚠️ errands | ✅ | ✅ | ⚠️ only while PC is awake | ✅ | ⚠️ preview | ✅ | ⚠️ | ✅ |
| App connectors | ✅ Composio, Zapier, MCP per bot | ⚠️ email, calendar, pay, FB/IG | ✅ 4,000+ | ⚠️ ~8 plus MCP | ✅ MCP and plugins | ⚠️ Google apps, MCP coming | ✅ Microsoft 365 | ⚠️ | ⚠️ | ✅ 1,000+ |
| Voice | ✅ calls with bots, voice typing, free local voice | ✅ live avatar | ✅ voice calls | ? | ✅ | ✅ | ✅ | ? | ⚠️ | ✅ phone agents |
| Reach the agent by text, email, chat apps | ✅ own number, email, Slack, Telegram, Discord | ✅ email, WhatsApp | ⚠️ Slack, Teams, US text beta | ❌ | ⚠️ phone app | ? | ⚠️ Teams | ? | ❌ | ✅ |
| Mobile app | ⚠️ Android remote, sideloaded, not yet tried on a phone; no iPhone | ✅ | ⚠️ message only | ⚠️ iPhone only | ✅ | ✅ | ✅ | ✅ | ⚠️ | ? |
| UI customization (widgets, tabs, pages, themes, animations) | ⚠️ look by chat, mini-apps and pages in tabs, mascot animations; no home widgets; dark mode unfinished | ⚠️ avatar | ⚠️ Pages | ? | ⚠️ artifacts | ⚠️ Canvas, Halo | ⚠️ Pages | ❌ | ❌ | ❌ |
| Multi-agent teams | ✅ bots, teammates, org chart, people | ❌ | ⚠️ subagents; teams planned | ✅ | ⚠️ subagents | ? | ⚠️ Researcher, Analyst | ⚠️ parallel | ❌ | ⚠️ |
| Files: Word, Excel, PowerPoint | ⚠️ makes new files (1-slide deck bug) | ? | ? | ⚠️ files on its PC | ✅ | ✅ Docs, Sheets | ✅ edits in place | ✅ | ⚠️ | ⚠️ |
| Builds and hosts apps | ✅ mini-apps, hosted apps with domains, Repos | ❌ | ⚠️ via Codex | ✅ | ✅ | ? | ⚠️ | ✅ | ❌ | ⚠️ |
| Self-hosting and privacy | ✅ your server, Tailscale-only, fair-source code | ❌ | ❌ | ❌ | ⚠️ local files, cloud model | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pricing | Free self-hosted with own keys; cloud Free, $20, $200 or pay by use | Free, $20, $100 | from $100 | ~$200 or bundle | $20 and up | Ultra tier | business seat | Free to $200 | Free; $200 for background | $30 to $200 |
| Proactive alerts | ✅ watches screens and pages, "now / quiet / later" alerts | ⚠️ | ✅ | ✅ | ⚠️ | ✅ live updates | ? | ? | ⚠️ | ✅ |
| Shopping and payments | ❌ | ✅ Stripe, Shopify, approval | ⚠️ saved card, approval | ? | ❌ | ? | ? | ? | ⚠️ | ❌ |
| Image and video generation | ⚠️ images yes; video planned | ✅ images | ✅ via ChatGPT | ? | ❌ | ✅ | ✅ images | ✅ | ⚠️ | ❌ |
| Learns a task by watching you | ⚠️ "save chat as skill" | ? | ? | ✅ | ⚠️ skills | ✅ teach skills | ? | ? | ❌ | ❌ |
| Skills, knowledge, goals, issues | ✅ all four | ? | ⚠️ goal per dot | ? | ✅ skills, projects | ⚠️ | ⚠️ | ⚠️ | ❌ | ⚠️ |
| Business data and CRM built in | ✅ treg (3,800+ data sources), CSV CRM | ❌ | ❌ | ⚠️ Salesforce | ❌ | ❌ | ⚠️ Dynamics | ❌ | ❌ | ⚠️ |
| Approvals before risky actions | ✅ per action, "allow for this chat" | ✅ | ✅ custom rules | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ | ✅ |
| Windows desktop app | ⚠️ installer works; PC tasks blocked | ? | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ web |
| Fully tested and stable | ⚠️ 66% of checks passed; GitHub checks paused | ✅ shipped | ✅ | ✅ | ✅ | ⚠️ beta | ⚠️ preview | ✅ | ✅ | ✅ |

---

## Gaps: what Bops doesn't have yet

Ranked by how much each would matter to you. Size: **S** = days, **M** = a week or two, **L** = a month or more.

1. **Bot tasks on your own Windows PC (M).** SAP, Power BI, your Excel books and SharePoint live on your work PC, and that is exactly where Claude, Grok Bot and Manus already work. In Bops this fails today (sign-in rejected); the fix to run them on your Claude plan is in review (TASKS 44, PR #80).
2. **Built-in Microsoft 365 data: Outlook, Teams, SharePoint, OneDrive (M).** Your plant data and Cost Savings files live there. Copilot and Grok Bot connect natively, while Bops has to go through Composio or Zapier, which aren't set up yet.
3. **Editing existing Office files in place (M).** Bops makes new Word, Excel and PowerPoint files. Copilot Agent Mode and Claude edit your real workbooks (formulas, pivots, your template) without rebuilding them, and that's most of your Excel work.
4. **A finished, tested phone app (M).** The Android remote hasn't been installed on a phone yet, and the phone layout has known issues. Every big competitor has a working mobile app with live progress, which matters for checking on bots from a plant floor or a property.
5. **Learn a task by watching you (M).** Grok Bot and Gemini save a demonstrated workflow as a routine. That's a direct fit for your monthly SAP pulls and report packs. Bops only turns a finished chat into a skill.
6. **Stability and test coverage (M).** Only 66% of checks have passed so far, and GitHub's automatic checks only just came back on (Nov 5). Polished competitors just work, so finishing testing is what makes Bops safe to trust with business data every day.
7. **Home dashboard of widgets, plus a full dark mode (S to M).** Muse, Dots (Pages) and Gemini (Halo) show status at a glance. Bops has mini-apps and pages in tabs, but no home screen of live tiles yet, and dark mode isn't finished. Both are being built now (TASKS 45, 47).
8. **Video, podcast and voice-over generation (M).** It's planned, not built. You'd use it for training and standard-work videos and property listing walkthroughs.
9. **WhatsApp channel (S to M).** It's planned and needs a Meta business account. Muse has WhatsApp built in, and tenants and contractors often text there.
10. **Shopping and payments with approval (L).** Muse and Dots can buy with your OK. It's useful for supplies and property maintenance orders, but it's high-risk and less urgent.
11. **iPhone app (L).** Grok Bot, Muse and Claude have one. It only matters if anyone else on your team uses an iPhone.
12. **Avatar, glasses and wearables (L).** It's Muse's showpiece and low value for your work.

---

## Where Bops is ahead

- **Choose any model, use your own keys:** OpenRouter, Ollama, z.ai, OpenAI, your Claude Max and ChatGPT plans, several accounts per provider, a model per routine. Every big competitor ties you to its own model.
- **Self-hosted and private:** it runs on your own Hostinger server, reachable only over Tailscale, and the code is open to read. None of the big names can be self-hosted.
- **A real team, not one assistant:** many bots with roles, teammates, an org chart, goals, ideas and issues. Grok Bot comes closest, and Dots says teams are coming later.
- **Many ways to reach your bots:** its own phone number with calls and texts, email, Slack, Telegram and Discord. Grok Bot has none of these, and Dots has only Slack and Teams.
- **Memory you can read and edit:** SOUL.md and MEMORY.md are plain files. Dots won't even show you its memories.
- **Builds things for your business:** mini-apps in tabs, hosted web apps on your domains, GitHub repos with 16 ready-to-run recipes (n8n, Paperless and more), and a CSV CRM.
- **Business data built in:** treg gives bots company and contact lookups from 3,800+ data sources.
- **Watching and smart alerts:** bots watch screens and web pages, and they sort news into interrupt now, show quietly, or tell you later.
- **Cost control:** free when self-hosted on your own keys, with free local voice and Ollama options, against $100 to $300 a month for Dots, Grok Bot or Gemini Ultra.

---

## Sources

- Bops repo: [Kevo919/bops `windows-port`](https://github.com/Kevo919/bops/tree/windows-port), [TESTS.md](https://github.com/Kevo919/bops/blob/team/TESTS.md), [PROGRESS.md](https://github.com/Kevo919/bops/blob/team/PROGRESS.md)
- Meta Muse: [Tech Insider](https://tech-insider.org/what-meta-actually-shipped-with-muse/), [Futureproof](https://futureproof.work/blog-posts/meta-muse-launches-ushering-in-the-era-of-always-on-consumer-ai), [CGM, Meta Connect 2026](https://www.cgmagonline.com/news/meta-connect-2026-all-big-announcements/), [Built In](https://builtin.com/articles/meta-muse-spark-ai-model)
- ChatGPT Dots: [Codersera](https://codersera.com/blog/openai-chatgpt-dots-guide-2026/), [BGR, DevDay 2026](https://www.bgr.com/2272332/openai-devday-2026-announcements/), [Design Compass](https://designcompass.org/en/2026/09/30/openai-dots-always-on-ai-agents/)
- Grok Bot: [Vellum](https://www.vellum.ai/blog/official-grok-bot-breakdown), [iGeeksBlog](https://www.igeeksblog.com/grok-bot-macos-ios-launch/), [Basenor](https://www.basenor.com/blogs/news/grok-bot-can-now-build-deploy-and-update-apps-autonomously), [Gigazine](https://gigazine.net/gsc_news/en/20260812-spacexai-grok-bot/)
- Claude: [Fast.io](https://fast.io/resources/claude-cowork-features-overview/), [LowCode Agency, Dispatch](https://www.lowcode.agency/blog/claude-dispatch-explained)
- Gemini Spark: [Tom's Guide](https://www.tomsguide.com/ai/google-gemini/google-unveils-gemini-spark-a-24-7-personal-ai-agent-that-could-be-a-game-changer-for-agentic-ai), [9to5Google](https://9to5google.com/2026/05/06/gemini-agent-planner-upgrade/)
- Microsoft Copilot: [Windows Report](https://windowsreport.com/microsoft-introduces-copilot-tasks-to-turn-ai-into-an-autonomous-digital-worker/), [Microsoft Tech Community](https://techcommunity.microsoft.com/blog/microsoft365copilotblog/agent-mode-general-availability/4488916)
- Manus: [Codersera](https://codersera.com/blog/manus-ai-2026-status-meta-block-desktop-app/), [TechRadar](https://www.techradar.com/pro/meta-buys-manus-for-usd2-billion-to-power-high-stakes-ai-agent-race)
- Perplexity Comet: [TechCrunch](https://techcrunch.com/2025/10/02/perplexitys-comet-ai-browser-now-free-max-users-get-new-background-assistant/)
- Lindy: [Automation Atlas](https://automationatlas.io/answers/lindy-review-2026/)
- Open-source: [OpenDots (ScriptByAI)](https://www.scriptbyai.com/opendots-openai-dots-alternative/), [OpenMuse review](https://andrew.ooo/posts/openmuse-review-copilotkit-open-source-personal-agent-meta-muse-alternative/), [OpenTag (MCP Directory)](https://mcp.directory/blog/opentag-agent-mention-gateways-2026), [OpenBot (ChatGate)](https://chatgate.ai/post/openbot-3)
