#!/usr/bin/env bash
# Bops on a fresh Ubuntu VPS (a Hostinger KVM plan, or any other), in one go: everything docs/hostinger.md
# walks through. Run it as root on the server:
#
#   curl -fsSL https://raw.githubusercontent.com/<you>/bops/windows-port/scripts/vps-setup.sh -o vps-setup.sh
#   sudo bash vps-setup.sh bops.example.com https://github.com/<you>/bops.git
#
# It installs Node 22, git and Caddy; makes a "bops" user; clones Bops (the windows-port branch); makes
# .env.local with a new BOPS_SECRET_KEY and BOPS_REQUIRE_REMOTE=1; builds; runs it as a service on
# 127.0.0.1 only; puts Caddy (with an automatic HTTPS certificate) in front for your domain; and prints a
# pairing code for the Bops app on your phone. Your keys (OpenAI, Orgo…) you add afterwards, in
# /home/bops/bops/.env.local, then: systemctl restart bops
#
# Already running something on ports 80 and 443 (n8n behind Traefik, any Docker stack)? That's what
# BOPS_TAILSCALE=1 is for: no Caddy, no public ports, Bops reached over your Tailscale network instead.
#
#   sudo BOPS_TAILSCALE=1 bash vps-setup.sh https://github.com/<you>/bops.git
#
# It installs Tailscale (its own apt repo), has you sign it in to your Tailscale account (it prints the
# link, or pass BOPS_TS_AUTHKEY for unattended), and serves Bops at https://<this machine's tailnet name>
# with tailscale serve. Only machines on your tailnet can reach it, your phone included with Tailscale on.
#
# Run it again to update: it pulls, rebuilds and restarts, and leaves .env.local and config/bops.yaml alone.
set -euo pipefail

domain="${1:-}"
repo="${2:-}"
# BOPS_SYNC=orgo: this server signs in with your Orgo account (from your phone) and shares one Bops with your
# PC and any other copy signed in with it (docs/sync.md). Unset: its own Bops, on your own keys.
sync="${BOPS_SYNC:-}"
# BOPS_TAILSCALE=1: no public domain and no Caddy; Bops is served on the tailnet (no port 80 or 443 at all).
tailscale_mode="${BOPS_TAILSCALE:-}"
branch="${BOPS_BRANCH:-windows-port}"
# In Tailscale mode there's no domain: the one argument is the repo.
if [ "$tailscale_mode" = "1" ] && [ -z "$repo" ]; then repo="$domain"; domain=""; fi
if [ -z "$repo" ] || { [ "$tailscale_mode" != "1" ] && [ -z "$domain" ]; }; then
  echo "Usage: sudo bash vps-setup.sh <your domain, e.g. bops.example.com> <your fork's git URL>" >&2
  echo "       sudo BOPS_TAILSCALE=1 bash vps-setup.sh <your fork's git URL>   (no public ports; server already uses 80/443)" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then echo "Run it as root (sudo bash vps-setup.sh …)." >&2; exit 1; fi
# Plain names only: the domain goes into Caddy's config.
if [ "$tailscale_mode" != "1" ] && ! [[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]]; then echo "That domain has characters a domain can't have." >&2; exit 1; fi

if [ "$tailscale_mode" != "1" ]; then
  # A public Bops takes 80 and 443 for its HTTPS. If something other than Caddy (ours from an earlier run)
  # is already listening there (n8n, Traefik, nginx, a Docker proxy), stop before touching anything: the
  # server's own setup wins, and Bops belongs on the tailnet instead.
  listeners=$(ss -H -ltnp 'sport = :80 or sport = :443' 2>/dev/null || true)
  if [ -n "$listeners" ] && grep -qv 'caddy' <<<"$listeners"; then
    echo "Something is already listening on port 80 or 443:" >&2
    echo "$listeners" >&2
    echo "This setup would put Caddy on those ports and won't touch what's running." >&2
    echo "Share the server instead: BOPS_TAILSCALE=1 needs no public port and reaches your phone over Tailscale:" >&2
    echo "  sudo BOPS_TAILSCALE=1 bash vps-setup.sh $repo" >&2
    exit 1
  fi
fi

echo "== Packages"
apt-get update -y
apt-get install -y git curl ca-certificates debian-keyring debian-archive-keyring apt-transport-https gnupg openssl
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
# The public way puts Caddy in front; the Tailscale way has its own server and skips this entirely.
if [ "$tailscale_mode" != "1" ] && ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
if [ "$tailscale_mode" = "1" ] && ! command -v tailscale >/dev/null; then
  # Tailscale from its own apt repo (pkgs.tailscale.com), for this Ubuntu's codename.
  . /etc/os-release
  curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.noarmor.gpg" | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
  curl -fsSL "https://pkgs.tailscale.com/stable/ubuntu/${VERSION_CODENAME}.tailscale-keyring.list" | tee /etc/apt/sources.list.d/tailscale.list >/dev/null
  apt-get update -y && apt-get install -y tailscale
fi

ts_name=""
if [ "$tailscale_mode" = "1" ]; then
  echo "== Tailscale"
  # Signed in already (a re-run): up silently. Not yet: it prints a login link and waits for you to open it
  # (or, for unattended setups, BOPS_TS_AUTHKEY carries the sign-in).
  if ! tailscale status --peers=false >/dev/null 2>&1; then
    if [ -n "${BOPS_TS_AUTHKEY:-}" ]; then
      tailscale up --auth-key="$BOPS_TS_AUTHKEY"
    else
      echo "   Tailscale will print a login link. Open it in a browser with your Tailscale account;"
      echo "   this setup carries on the moment this server is in (it can take a minute after approving)."
      tailscale up
    fi
  fi
  # This machine's name on the tailnet (host.tailnet.ts.net), which is Bops' address on it.
  ts_name=$(tailscale status --json 2>/dev/null | node -e 'try { process.stdout.write((JSON.parse(require("fs").readFileSync(0)).Self.DNSName || "").replace(/\.$/, "")) } catch {}')
  if [ -z "$ts_name" ]; then echo "Couldn't read this machine's tailnet name (tailscale status). Try again in a moment." >&2; exit 1; fi
  # Bops, with its own HTTPS certificate on the tailnet, on 443 of the tailnet only: no public port touched.
  tailscale serve --bg --https=443 http://127.0.0.1:3210
fi

echo "== The bops user and Bops itself"
id bops >/dev/null 2>&1 || useradd -m -s /bin/bash bops
home=/home/bops/bops
if [ -d "$home/.git" ]; then
  sudo -u bops git -C "$home" pull --ff-only
else
  sudo -u bops git clone --branch "$branch" "$repo" "$home"
fi
cd "$home"
if [ ! -f .env.local ]; then
  sudo -u bops cp .env.example .env.local
  {
    echo ""
    echo "# Set by scripts/vps-setup.sh"
    if [ "$sync" = "orgo" ]; then echo "BOPS_SELF_HOSTED=0"; else echo "BOPS_SELF_HOSTED=1"; fi
    echo "BOPS_REQUIRE_REMOTE=1"
    echo "BOPS_SECRET_KEY=$(openssl rand -hex 32)"
    if [ "$tailscale_mode" = "1" ]; then echo "BOPS_PUBLIC_URL=https://$ts_name"; else echo "BOPS_PUBLIC_URL=https://$domain"; fi
  } >> .env.local
  chown bops:bops .env.local
  chmod 600 .env.local
  echo "   Made .env.local. Keep a copy of its BOPS_SECRET_KEY somewhere safe: saved logins need it."
fi
sudo -u bops npm install --include=dev --no-audit --no-fund
sudo -u bops npx next build

echo "== Service"
cat > /etc/systemd/system/bops.service <<UNIT
[Unit]
Description=Bops
After=network-online.target

[Service]
User=bops
WorkingDirectory=$home
ExecStart=/usr/bin/npx next start --port 3210 -H 127.0.0.1
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable bops >/dev/null
systemctl restart bops

if [ "$tailscale_mode" != "1" ]; then
  echo "== HTTPS (Caddy)"
  cat > /etc/caddy/Caddyfile <<CADDY
$domain {
    reverse_proxy 127.0.0.1:3210
}
CADDY
  systemctl reload caddy || systemctl restart caddy
fi

echo "== Your phone"
if [ ! -f "$home/.data/remote.json" ]; then
  sudo -u bops node scripts/pair-phone.mjs
else
  echo "   A phone is paired already. To pair a new one: sudo -u bops node $home/scripts/pair-phone.mjs"
fi

if [ "$tailscale_mode" = "1" ]; then
  cat <<DONE

Bops is running at https://$ts_name, on your Tailscale network only (Tailscale on, on your phone, signed
in to the same account). Nothing about this server's public ports changed.
Next:
  1. Add your keys to $home/.env.local (OPENAI_API_KEY, OPENAI_EXECUTOR_API_KEY, ORGO_API_KEY, …),
     or, set up with BOPS_SYNC=orgo, open it on your phone and Sign in with Orgo (the same account as your PC).
  2. systemctl restart bops
  3. In the Bops app on your phone: address https://$ts_name and the pairing code above.
Logs: journalctl -u bops -f
DONE
else
  cat <<DONE

Bops is running at https://$domain (give Caddy a minute for the certificate; your domain's DNS must point here).
Next:
  1. Add your keys to $home/.env.local (OPENAI_API_KEY, OPENAI_EXECUTOR_API_KEY, ORGO_API_KEY, …),
     or, set up with BOPS_SYNC=orgo, open it on your phone and Sign in with Orgo (the same account as your PC).
  2. systemctl restart bops
  3. In the Bops app on your phone: address https://$domain and the pairing code above.
Logs: journalctl -u bops -f
DONE
fi
