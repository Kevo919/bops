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
# Run it again to update: it pulls, rebuilds and restarts, and leaves .env.local and config/bops.yaml alone.
set -euo pipefail

domain="${1:-}"
repo="${2:-}"
# BOPS_SYNC=orgo: this server signs in with your Orgo account (from your phone) and shares one Bops with your
# PC and any other copy signed in with it (docs/sync.md). Unset: its own Bops, on your own keys.
sync="${BOPS_SYNC:-}"
branch="${BOPS_BRANCH:-windows-port}"
if [ -z "$domain" ] || [ -z "$repo" ]; then
  echo "Usage: sudo bash vps-setup.sh <your domain, e.g. bops.example.com> <your fork's git URL>" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then echo "Run it as root (sudo bash vps-setup.sh …)." >&2; exit 1; fi
# Plain names only: the domain goes into Caddy's config.
if ! [[ "$domain" =~ ^[A-Za-z0-9.-]+$ ]]; then echo "That domain has characters a domain can't have." >&2; exit 1; fi

echo "== Packages"
apt-get update -y
apt-get install -y git curl ca-certificates debian-keyring debian-archive-keyring apt-transport-https gnupg openssl
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
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
    echo "BOPS_PUBLIC_URL=https://$domain"
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

echo "== HTTPS (Caddy)"
cat > /etc/caddy/Caddyfile <<CADDY
$domain {
    reverse_proxy 127.0.0.1:3210
}
CADDY
systemctl reload caddy || systemctl restart caddy

echo "== Your phone"
if [ ! -f "$home/.data/remote.json" ]; then
  sudo -u bops node scripts/pair-phone.mjs
else
  echo "   A phone is paired already. To pair a new one: sudo -u bops node $home/scripts/pair-phone.mjs"
fi

cat <<DONE

Bops is running at https://$domain (give Caddy a minute for the certificate; your domain's DNS must point here).
Next:
  1. Add your keys to $home/.env.local (OPENAI_API_KEY, OPENAI_EXECUTOR_API_KEY, ORGO_API_KEY, …),
     or, set up with BOPS_SYNC=orgo, open it on your phone and Sign in with Orgo (the same account as your PC).
  2. systemctl restart bops
  3. In the Bops app on your phone: address https://$domain and the pairing code above.
Logs: journalctl -u bops -f
DONE
