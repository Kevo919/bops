/**
 * Bops' modules: every part you can swap or switch off, in one place, the way DeepSeek Harness keeps
 * its plugins in settings.yaml. Each module is a section of config/bops.yaml; each of its settings
 * says which setting of Bops' own it drives (the environment variables the code already reads), so
 * changing a module changes nothing in the code. Keys and secrets stay in .env.local (as DSH keeps
 * them in .credentials.yaml), never in bops.yaml.
 *
 *   config/bops.yaml            yours: what you changed (made from bops.example.yaml, never committed)
 *   config/bops.example.yaml    every module and setting, with what it does
 *   config/modules.d/*.cjs      more modules of your own: each exports an array shaped like MODULES
 *
 * What wins: what bops.yaml says (what you set in Settings, Modules), then .env.local and the
 * environment, then Bops' default. A module turned off (enabled: false) clears its keys for this
 * server, so Bops runs as if that service weren't set up at all.
 *
 * Changes take effect when Bops restarts (Settings, Modules, Save and restart).
 */
const fs = require("node:fs");
const path = require("node:path");

/**
 * A setting: `key` in the module's section, the `env` it drives, a `label` and `help` for Settings, and
 * its `type` ("text", "toggle" or a list of `options`). A toggle writes "1" or "0" (or `on`/`off`).
 * `keys`: the secrets the module needs (in .env.local), cleared when the module is off.
 */
const MODULES = [
  {
    id: "ai",
    name: "AI models",
    help: "The models your bots think with. Any provider with OpenAI's Responses API works for chat (OpenAI, Azure OpenAI, OpenRouter, a local server); tasks on computers use OpenAI's Agents API and computer tool, so they need OpenAI or a provider that copies those.",
    keys: [],
    required: true,
    settings: [
      { key: "baseURL", env: "OPENAI_BASE_URL", label: "Provider address", help: "Blank for OpenAI. For another provider, its OpenAI-compatible address (https://…/v1).", type: "text" },
      { key: "chat", env: "BOPS_CHAT_MODEL", label: "Chat model", type: "text", placeholder: "gpt-6.1-sol" },
      { key: "chatEffort", env: "BOPS_CHAT_EFFORT", label: "Chat effort", type: ["low", "medium", "high"], placeholder: "medium" },
      { key: "tasks", env: "BOPS_SESSION_MODEL", label: "Task model", type: "text", placeholder: "gpt-6.1-sol" },
      { key: "hardTasks", env: "BOPS_HARD_MODEL", label: "Hard task model", type: "text", placeholder: "gpt-6-astra" },
      { key: "light", env: "BOPS_LIGHT_MODEL", label: "Quick model (routing, memory, watches)", type: "text", placeholder: "gpt-6-luna" },
      { key: "phone", env: "BOPS_PHONE_MODEL", label: "Phone call model", type: "text" },
      { key: "image", env: "BOPS_IMAGE_MODEL", label: "Image model", type: "text", placeholder: "gpt-image-2.5-flare" },
      { key: "imageEdit", env: "BOPS_IMAGE_EDIT_MODEL", label: "Image editing model", type: "text" },
    ],
  },
  {
    id: "computers",
    name: "Bots' computers",
    help: "The cloud computers bots work on (Orgo).",
    keys: ["ORGO_API_KEY"],
    settings: [
      { key: "workspace", env: "BOPS_ORGO_WORKSPACE", label: "Orgo workspace", type: "text", placeholder: "bops" },
      { key: "template", env: "BOPS_ORGO_TEMPLATE", label: "Computer template", type: "text" },
      { key: "diskGB", env: "BOPS_DISK_GB", label: "Disk size (GB)", type: "text" },
      { key: "computerTool", env: "BOPS_COMPUTER_TOOL", label: "Use OpenAI's computer tool", type: "toggle", default: true },
    ],
  },
  {
    id: "thisComputer",
    name: "This computer",
    help: "Bots doing tasks on this PC (or Mac), in a Chrome of their own. Full access is its own switch in Settings.",
    keys: [],
    settings: [
      { key: "enabled", env: "BOPS_THIS_COMPUTER", label: "Bots can work on this computer", type: "toggle", default: true },
      { key: "chromeWindows", env: "BOPS_CHROME_WINDOWS", label: "Show their Chrome windows", type: "toggle", default: false, off: "" },
      { key: "keepAwake", env: "BOPS_KEEP_AWAKE", label: "Keep the computer awake during tasks", type: "toggle", default: true },
    ],
  },
  {
    id: "memory",
    name: "Memory",
    help: "What your bots remember about you, across chats (Honcho).",
    keys: ["HONCHO_API_KEY"],
    settings: [{ key: "workspace", env: "HONCHO_WORKSPACE_ID", label: "Honcho workspace", type: "text" }],
  },
  {
    id: "apps",
    name: "Your apps",
    help: "Gmail, Calendar and about 1,400 more apps (Composio).",
    keys: ["COMPOSIO_API_KEY"],
    settings: [],
  },
  {
    id: "businessData",
    name: "Business data",
    help: "Companies, people, emails and phone numbers to look up (treg).",
    keys: ["TREG_TOKEN"],
    settings: [],
  },
  {
    id: "judge",
    name: "Quick judgments",
    help: "Small yes-or-no calls: is this risky, which bot should take it (TypeSafe).",
    keys: ["TYPESAFE_API_KEY"],
    settings: [],
  },
  {
    id: "email",
    name: "Bots' email",
    help: "Your main bot's own email address (AgentMail).",
    keys: ["AGENTMAIL_API_KEY"],
    settings: [{ key: "domain", env: "BOPS_MAIL_DOMAIN", label: "Email domain", type: "text" }],
  },
  {
    id: "phone",
    name: "Texts and calls",
    help: "Your main bot's own phone number (AgentPhone).",
    keys: ["AGENTPHONE_API_KEY"],
    settings: [
      { key: "area", env: "BOPS_PHONE_AREA", label: "Area code for new numbers", type: "text" },
      { key: "hookURL", env: "BOPS_AGENTPHONE_HOOK_URL", label: "Webhook address", type: "text" },
    ],
  },
  {
    id: "remote",
    name: "Your phone and the internet",
    help: "Reaching this Bops from the Bops Android app, or from the internet.",
    keys: [],
    settings: [
      { key: "publicURL", env: "BOPS_PUBLIC_URL", label: "Public https address", type: "text" },
      { key: "requirePairing", env: "BOPS_REQUIRE_REMOTE", label: "Only the paired phone may connect (for a server on the internet)", type: "toggle", default: false },
    ],
  },
  {
    id: "brains",
    name: "Agent harnesses",
    help: "Let bots run Claude Code, OpenCode and other agents on their computers (rebuild to apply).",
    keys: [],
    settings: [{ key: "enabled", env: "NEXT_PUBLIC_BOPS_BRAINS", label: "Agent harnesses", type: "toggle", default: false }],
  },
  {
    id: "privacy",
    name: "Usage data",
    help: "Counts sent to Orgo when signed in with Orgo (never what you or your bots write). Self-hosted sends nothing.",
    keys: [],
    settings: [{ key: "telemetry", env: "BOPS_TELEMETRY", label: "Share usage data", type: "toggle", default: true }],
  },
];

/** The modules: these, then any of yours in config/modules.d/. */
function modules(root) {
  const extra = [];
  const dir = path.join(root, "config", "modules.d");
  try {
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".cjs")).sort()) {
      const more = require(path.join(dir, f));
      if (Array.isArray(more)) extra.push(...more);
    }
  } catch {}
  return [...MODULES, ...extra];
}

const file = (root) => path.join(root, "config", "bops.yaml");

/** config/bops.yaml as an object ({} when there's none, or it can't be read). */
function read(root) {
  try {
    const YAML = require("yaml");
    return YAML.parse(fs.readFileSync(file(root), "utf8")) ?? {};
  } catch {
    return {};
  }
}

/** Write config/bops.yaml, keeping the comments of a file that's there (its sections are set, not rebuilt). */
function write(root, config) {
  const YAML = require("yaml");
  let doc;
  try {
    doc = YAML.parseDocument(fs.readFileSync(file(root), "utf8"));
  } catch {
    doc = new YAML.Document({});
  }
  for (const [section, values] of Object.entries(config))
    for (const [key, value] of Object.entries(values ?? {})) {
      if (value === undefined || value === null || value === "") doc.deleteIn([section, key]);
      else doc.setIn([section, key], value);
    }
  fs.mkdirSync(path.dirname(file(root)), { recursive: true });
  const tmp = `${file(root)}.tmp`;
  fs.writeFileSync(tmp, String(doc));
  fs.renameSync(tmp, file(root));
}

const toggleValue = (setting, on) => (on ? (setting.on ?? "1") : (setting.off ?? "0"));

/**
 * Put bops.yaml into `env` (process.env by default): each setting that isn't already set in the real
 * environment, and each module that's off clears its keys. `outer` is the environment from outside
 * (the system, the service), which bops.yaml never overrides. Returns what it set, for the log.
 */
function apply(root, env = process.env, outer = {}) {
  const config = read(root);
  const set = [];
  for (const m of modules(root)) {
    const section = config[m.id] ?? {};
    if (section.enabled === false && !m.required) {
      for (const k of m.keys ?? []) if (!(k in outer)) delete env[k];
      if (m.keys?.length) set.push(`${m.id}: off`);
    }
    for (const s of m.settings ?? []) {
      if (!(s.key in section) || s.env in outer) continue;
      const v = section[s.key];
      env[s.env] = s.type === "toggle" ? toggleValue(s, !!v) : String(v);
      set.push(`${m.id}.${s.key}`);
    }
  }
  return set;
}

/** What Settings shows: each module, whether it's on and set up, and its settings' current values. */
function describe(root, env = process.env) {
  const config = read(root);
  return modules(root).map((m) => {
    const section = config[m.id] ?? {};
    return {
      id: m.id,
      name: m.name,
      help: m.help,
      required: !!m.required,
      enabled: m.required ? true : section.enabled !== false,
      keysSet: (m.keys ?? []).every((k) => !!env[k]?.trim()),
      keys: m.keys ?? [],
      settings: (m.settings ?? []).map((s) => ({
        key: s.key,
        label: s.label,
        help: s.help ?? null,
        type: s.type,
        placeholder: s.placeholder ?? null,
        value: s.key in section ? section[s.key] : s.type === "toggle" ? (env[s.env] !== undefined ? env[s.env] === toggleValue(s, true) : (s.default ?? false)) : (env[s.env] ?? ""),
      })),
    };
  });
}

module.exports = { MODULES, modules, read, write, apply, describe, file };
