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
# Tailscale is brought up with --accept-dns=false (so /etc/resolv.conf, and Docker's DNS, stay as they
# are) and --netfilter-mode=off (no iptables/nftables rules). It needs MagicDNS and HTTPS Certificates
# turned on in the Tailscale admin console (DNS page) for tailscale serve's https.
# Pass the auth key without putting it on a command line (sudo's arguments show in ps):
#   sudo -i; read -rs BOPS_TS_AUTHKEY; export BOPS_TS_AUTHKEY; BOPS_TAILSCALE=1 bash vps-setup.sh <repo>
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

# apt-based, and the Tailscale repo path is per distribution and release: read both from os-release (in a
# subshell, so its variables don't land in this script) and stop on anything but Ubuntu or Debian.
# shellcheck disable=SC1091
os_id=$(. /etc/os-release 2>/dev/null && printf '%s' "${ID:-}")
# shellcheck disable=SC1091
os_codename=$(. /etc/os-release 2>/dev/null && printf '%s' "${VERSION_CODENAME:-}")
case "$os_id" in
  ubuntu|debian) ;;
  *) echo "This setup supports Ubuntu and Debian only; /etc/os-release says ID=${os_id:-<missing>}. Nothing was changed." >&2; exit 1;;
esac
if ! [[ "$os_codename" =~ ^[a-z0-9-]+$ ]]; then
  echo "/etc/os-release has no usable VERSION_CODENAME (got '${os_codename}'). Nothing was changed." >&2
  exit 1
fi

if [ "$tailscale_mode" != "1" ]; then
  if ! command -v ss >/dev/null 2>&1; then
    echo "Cannot check public ports: install iproute2 (which provides ss), then run setup again. Nothing was changed." >&2
    exit 1
  fi
  # A public Bops takes 80 and 443 for its HTTPS. If something other than Caddy (ours from an earlier run)
  # is already listening there (n8n, Traefik, nginx, a Docker proxy), stop before touching anything: the
  # server's own setup wins, and Bops belongs on the tailnet instead.
  if ! listeners=$(ss -H -ltnp 'sport = :80 or sport = :443' 2>/dev/null); then
    echo "Cannot inspect public ports: ss failed. Fix the socket inspection error, then run setup again. Nothing was changed." >&2
    exit 1
  fi
  if [ -n "$listeners" ] && grep -qv 'caddy' <<<"$listeners"; then
    echo "Something is already listening on port 80 or 443:" >&2
    echo "$listeners" >&2
    echo "This setup would put Caddy on those ports and won't touch what's running." >&2
    echo "Share the server instead: BOPS_TAILSCALE=1 needs no public port and reaches your phone over Tailscale:" >&2
    echo "  sudo BOPS_TAILSCALE=1 bash vps-setup.sh $repo" >&2
    exit 1
  fi
  # Docker can publish 80/443 with DNAT rules alone (userland-proxy off), with no socket for ss to see.
  # Bops never runs in a container, so any container publishing those ports belongs to something else.
  # A docker CLI whose daemon can't be asked counts as unknown, and unknown fails closed.
  if command -v docker >/dev/null 2>&1; then
    if ! published=$(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null); then
      echo "Cannot check Docker's published ports: 'docker ps' failed. Start Docker (or fix access to it), then run setup again. Nothing was changed." >&2
      exit 1
    fi
    taken=""
    while IFS= read -r mapping; do
      remaining="$mapping"
      # Docker compresses adjacent mappings (e.g. :79-81->79-81/tcp). Inspect
      # the published HOST interval, never the container-side destination ports.
      while [[ "$remaining" =~ :([0-9]+)(-([0-9]+))?-\> ]]; do
        matched="${BASH_REMATCH[0]}"
        low="${BASH_REMATCH[1]}"
        high="${BASH_REMATCH[3]:-${BASH_REMATCH[1]}}"
        if (( (10#$low <= 80 && 10#$high >= 80) || (10#$low <= 443 && 10#$high >= 443) )); then
          taken+="$mapping"$'\n'
          break
        fi
        remaining=${remaining#*"$matched"}
      done
    done <<<"$published"
    if [ -n "$taken" ]; then
      echo "A Docker container already publishes port 80 or 443:" >&2
      echo "$taken" >&2
      echo "This setup would put Caddy on those ports and won't touch what's running." >&2
      echo "Share the server instead: BOPS_TAILSCALE=1 needs no public port and reaches your phone over Tailscale:" >&2
      echo "  sudo BOPS_TAILSCALE=1 bash vps-setup.sh $repo" >&2
      exit 1
    fi
  fi
  if [ -n "$listeners" ] || [ -s /etc/caddy/Caddyfile ]; then
    expected_caddy=$(printf '# Managed by Bops vps-setup.sh\n%s {\n    reverse_proxy 127.0.0.1:3210\n}' "$domain")
    if [ ! -f /etc/caddy/Caddyfile ] || [ "$(cat /etc/caddy/Caddyfile)" != "$expected_caddy" ] ||
       [ ! -f /etc/systemd/system/bops.service ] ||
       ! grep -qx 'WorkingDirectory=/home/bops/bops' /etc/systemd/system/bops.service ||
       ! grep -qx 'ExecStart=/usr/bin/npx next start --port 3210 -H 127.0.0.1' /etc/systemd/system/bops.service; then
      echo "An existing Caddy listener or configuration is not this Bops installation's managed configuration." >&2
      echo "Unmarked configurations (including older Bops installations) need manual review; setup will not adopt or overwrite them." >&2
      echo "Nothing was changed. Use BOPS_TAILSCALE=1 to share this server without changing its public services." >&2
      exit 1
    fi
  fi
fi

echo "== Packages"
apt-get update -y
apt-get install -y sudo git curl ca-certificates debian-keyring debian-archive-keyring apt-transport-https gnupg openssl
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
  # Tailscale from its own apt repo (pkgs.tailscale.com), for this distribution and release (checked above).
  curl -fsSL "https://pkgs.tailscale.com/stable/${os_id}/${os_codename}.noarmor.gpg" | tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
  curl -fsSL "https://pkgs.tailscale.com/stable/${os_id}/${os_codename}.tailscale-keyring.list" | tee /etc/apt/sources.list.d/tailscale.list >/dev/null
  apt-get update -y && apt-get install -y tailscale
fi

ts_name=""
if [ "$tailscale_mode" = "1" ]; then
  echo "== Tailscale"
  # --accept-dns=false: tailscaled leaves /etc/resolv.conf alone, so Docker containers (n8n) keep their DNS.
  # --netfilter-mode=off: tailscaled writes no iptables/nftables rules at all. tailscale serve still works:
  # tailscaled answers the served port (443 on the tailnet address) in its own userspace network stack
  # (wgengine/netstack: shouldProcessInbound -> ShouldInterceptTCPPort) before a packet reaches the kernel,
  # and dials 127.0.0.1:3210 over loopback, so neither direction goes through netfilter. What off gives up:
  # Tailscale's anti-spoofing rule for its 100.64.0.0/10 range on other interfaces, and subnet-router/exit-node
  # NAT, neither of which Bops uses (Bops listens on 127.0.0.1 only).
  ts_flags=(--accept-dns=false --netfilter-mode=off)
  # Signed in already (a re-run): leave it be. Not yet: with BOPS_TS_AUTHKEY, unattended; without, it prints a
  # login link and waits for you to open it.
  if ! tailscale status --peers=false >/dev/null 2>&1; then
    if [ -n "${BOPS_TS_AUTHKEY:-}" ]; then
      # The key goes in a 0600 file (mktemp's mode) passed as file:<path>, so it never shows in ps.
      ts_key_file=$(umask 077 && mktemp /root/.bops-ts-authkey.XXXXXX)
      trap 'rm -f "$ts_key_file"' EXIT
      printf '%s' "$BOPS_TS_AUTHKEY" >"$ts_key_file"
      unset BOPS_TS_AUTHKEY
      tailscale up "${ts_flags[@]}" --auth-key="file:$ts_key_file"
      rm -f "$ts_key_file"
      trap - EXIT
    else
      echo ""
      echo "   ============================================================================"
      echo "   Sign this server in to Tailscale: open the https://login.tailscale.com/... link"
      echo "   printed below in any browser, signed in to your Tailscale account."
      echo "   Setup waits here and carries on by itself once the server is approved."
      echo "   ============================================================================"
      echo ""
      tailscale up "${ts_flags[@]}"
    fi
  else
    # Up from before (an earlier run, or your own Tailscale). Its settings are yours: report, don't change.
    ts_prefs=$(tailscale debug prefs 2>/dev/null | node -e 'try { const p = JSON.parse(require("fs").readFileSync(0)); process.stdout.write((p.CorpDNS ? "dns " : "") + (p.NetfilterMode ? "netfilter" : "")) } catch {}' || true)
    if [ -n "$ts_prefs" ]; then
      echo "   Note: Tailscale here was set up earlier with$( [[ $ts_prefs == *dns* ]] && echo ' DNS from the admin console')$( [[ $ts_prefs == *netfilter* ]] && echo ' iptables rules managed')."
      echo "   For n8n/Docker's DNS and no firewall rules, as this setup would: tailscale set ${ts_flags[*]}"
    fi
  fi
  # This machine's name on the tailnet (host.tailnet.ts.net), which is Bops' address on it, and whether the
  # tailnet issues HTTPS certificates (CertDomains is empty unless MagicDNS and HTTPS are both on).
  ts_json=$(tailscale status --json 2>/dev/null || true)
  ts_name=$(node -e 'try { process.stdout.write((JSON.parse(require("fs").readFileSync(0)).Self.DNSName || "").replace(/\.$/, "")) } catch {}' <<<"$ts_json")
  ts_certs=$(node -e 'try { process.stdout.write(String((JSON.parse(require("fs").readFileSync(0)).CertDomains || []).length)) } catch { process.stdout.write("0") }' <<<"$ts_json")
  if [ -z "$ts_name" ]; then echo "Couldn't read this machine's tailnet name (tailscale status). Try again in a moment." >&2; exit 1; fi
  ts_https_help="In the Tailscale admin console, DNS page (https://login.tailscale.com/admin/dns), turn on MagicDNS and, under it, HTTPS Certificates; then run this setup again."
  if [ "$ts_certs" = "0" ]; then
    echo "   Tailscale reports no HTTPS certificate for this machine yet. $ts_https_help"
  fi
  # Bops, with its own HTTPS certificate on the tailnet, on 443 of the tailnet only: no public port touched.
  if ! tailscale serve --bg --https=443 http://127.0.0.1:3210; then
    echo "tailscale serve failed. $ts_https_help" >&2
    exit 1
  fi
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
# Managed by Bops vps-setup.sh
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
https://$ts_name needs MagicDNS and HTTPS Certificates on in the Tailscale admin console, DNS page
(https://login.tailscale.com/admin/dns). Tailscale runs here with --accept-dns=false --netfilter-mode=off.
Logs: journalctl -u bops -f
DONE
  # A public-mode run before this one leaves its pieces behind; this run doesn't remove them (they're on the
  # public side this mode promises not to touch). Say what's there and how to clear it by hand.
  env_url=$(grep -E '^BOPS_PUBLIC_URL=' "$home/.env.local" 2>/dev/null | tail -n 1 | cut -d= -f2- || true)
  if [ -n "$env_url" ] && [ "$env_url" != "https://$ts_name" ]; then
    cat <<LEFT

Left from an earlier setup: $home/.env.local has BOPS_PUBLIC_URL=$env_url (this run keeps .env.local
as it is). For the tailnet address, change that line to BOPS_PUBLIC_URL=https://$ts_name, then
systemctl restart bops.
LEFT
  fi
  if grep -qx '# Managed by Bops vps-setup.sh' /etc/caddy/Caddyfile 2>/dev/null; then
    cat <<LEFT

Left from an earlier public setup: Caddy, with Bops' /etc/caddy/Caddyfile, still serves the old domain
on ports 80/443. This run didn't touch it. If nothing else on this server uses Caddy, remove it by hand:
  systemctl disable --now caddy
  apt-get remove caddy            (or: apt-get purge caddy, which also deletes /etc/caddy)
  rm -f /etc/apt/sources.list.d/caddy-stable.list /usr/share/keyrings/caddy-stable-archive-keyring.gpg
LEFT
  fi
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
