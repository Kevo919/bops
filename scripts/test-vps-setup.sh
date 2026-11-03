#!/usr/bin/env bash
# Run INSIDE a disposable Ubuntu 24.04 Docker container, never on a VPS/host:
# docker run --rm --memory=3g --cpus=2 -e BOPS_VPS_TEST_CONTAINER=1 \
#   --mount type=bind,src=<checkout>,dst=/source,readonly ubuntu:24.04 \
#   bash -c "sed 's/\r$//' /source/scripts/test-vps-setup.sh | BOPS_TEST_SOURCE=/source bash"
# No privileged mode, published ports, host network, Docker socket or writable host mounts.
# Real: apt, NodeSource Node 22, official Tailscale package/repository, git,
# user/permissions, npm, minimal Next build, pairing.
# Fixtures: systemctl records intent (no systemd); Tailscale status/serve skip real
# authentication/certificates; a tiny Next app replaces the full Bops build.
# This is installer integration evidence, NOT a full Bops/VPS/Tailscale deployment test.
set -euo pipefail
[[ ${BOPS_VPS_TEST_CONTAINER:-} == 1 && -f /.dockerenv && $(id -u) == 0 ]] || {
  echo 'Refusing: requires an explicitly marked disposable Docker container running as root.' >&2; exit 1;
}
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || { echo 'Requires Ubuntu 24.04.' >&2; exit 1; }
[[ ! -e /home/bops && ! -e /etc/systemd/system/bops.service ]] || { echo 'Requires fresh container.' >&2; exit 1; }
source_dir=${BOPS_TEST_SOURCE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}
scratch=$(mktemp -d /tmp/bops-vps-test.XXXXXX)
chmod 755 "$scratch"
# Windows bind mounts may expose Git checkout CRLF; execute an otherwise identical LF copy.
setup="$scratch/vps-setup.sh"
sed 's/\r$//' "$source_dir/scripts/vps-setup.sh" >"$setup"
export DEBIAN_FRONTEND=noninteractive NEXT_TELEMETRY_DISABLED=1
trap '[[ -z ${listener_pid:-} ]] || kill "$listener_pid" 2>/dev/null || true' EXIT
fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }
mkdir "$scratch/no-ss"
ln -s /usr/bin/id "$scratch/no-ss/id"
if PATH="$scratch/no-ss" /bin/bash "$setup" bops.example.test /unused >"$scratch/missing-ss.log" 2>&1; then
  fail 'public setup accepted missing ss'
fi
grep -q 'install iproute2' "$scratch/missing-ss.log" || fail 'missing-ss diagnostic'
[[ ! -e /home/bops && ! -e /etc/systemd/system/bops.service ]] || fail 'missing-ss run mutated installation'
pass 'missing ss fails closed before installation'
cat >"$scratch/no-ss/ss" <<'SH'
#!/bin/bash
exit 73
SH
chmod 755 "$scratch/no-ss/ss"
if PATH="$scratch/no-ss" /bin/bash "$setup" bops.example.test /unused >"$scratch/failed-ss.log" 2>&1; then
  fail 'public setup accepted failed ss'
fi
grep -q 'ss failed' "$scratch/failed-ss.log" || fail 'failed-ss diagnostic'
[[ ! -e /home/bops && ! -e /etc/systemd/system/bops.service ]] || fail 'failed-ss run mutated installation'
pass 'failed ss fails closed before installation'

# Docker publishing 80/443 by DNAT has no socket for ss: the docker ps check must catch it, and a docker
# CLI that can't reach its daemon must fail closed. apt-get aborts if the gate is ever passed.
mkdir "$scratch/docker-gate"
for tool in id cat grep; do ln -s "/usr/bin/$tool" "$scratch/docker-gate/$tool"; done
printf '#!/bin/bash\nexit 0\n' >"$scratch/docker-gate/ss"
printf '#!/bin/bash\necho PACKAGE_GATE_REACHED\nexit 88\n' >"$scratch/docker-gate/apt-get"
printf '#!/bin/bash\nprintf "n8n 0.0.0.0:5678->5678/tcp\\ntraefik 0.0.0.0:443->443/tcp, [::]:443->443/tcp\\n"\n' >"$scratch/docker-gate/docker"
chmod 755 "$scratch/docker-gate/ss" "$scratch/docker-gate/apt-get" "$scratch/docker-gate/docker"
if PATH="$scratch/docker-gate" /bin/bash "$setup" bops.example.test /unused >"$scratch/docker-443.log" 2>&1; then fail 'docker-published 443 accepted'; fi
grep -q 'container already publishes' "$scratch/docker-443.log" || fail 'docker-published diagnostic'
! grep -q PACKAGE_GATE_REACHED "$scratch/docker-443.log" || fail 'docker-published reached mutations'
printf '#!/bin/bash\nexit 1\n' >"$scratch/docker-gate/docker"
if PATH="$scratch/docker-gate" /bin/bash "$setup" bops.example.test /unused >"$scratch/docker-down.log" 2>&1; then fail 'failed docker ps accepted'; fi
grep -q "'docker ps' failed" "$scratch/docker-down.log" || fail 'failed docker ps diagnostic'
printf '#!/bin/bash\nprintf "n8n 0.0.0.0:5678->5678/tcp\\nweb 0.0.0.0:8080->80/tcp\\n"\n' >"$scratch/docker-gate/docker"
if PATH="$scratch/docker-gate" /bin/bash "$setup" bops.example.test /unused >"$scratch/docker-free.log" 2>&1; then fail 'package gate did not stop docker-free fixture'; fi
grep -q PACKAGE_GATE_REACHED "$scratch/docker-free.log" || fail 'unrelated docker ports rejected'
pass 'docker-published 80/443 and failed docker ps refuse; other ports pass preflight'

# Only Ubuntu and Debian: the Tailscale repo path is built from os-release's ID and VERSION_CODENAME.
cp /etc/os-release "$scratch/os-release.orig"
printf 'ID=fedora\nVERSION_ID=40\n' >/etc/os-release
if BOPS_TAILSCALE=1 PATH="$scratch/docker-gate" /bin/bash "$setup" /unused >"$scratch/os.log" 2>&1; then fail 'unsupported OS accepted'; fi
cp "$scratch/os-release.orig" /etc/os-release
grep -q 'Ubuntu and Debian only' "$scratch/os.log" || fail 'unsupported OS diagnostic'
! grep -q PACKAGE_GATE_REACHED "$scratch/os.log" || fail 'unsupported OS reached mutations'
pass 'unsupported distribution refused before installation'

# Gate-only fixtures: represent an occupied Caddy socket, and abort at the first
# package command to prove the owned rerun passes without requesting certificates.
mkdir "$scratch/caddy-gate"
for tool in id cat grep; do ln -s "/usr/bin/$tool" "$scratch/caddy-gate/$tool"; done
printf '#!/bin/bash\nprintf "LISTEN 0 4096 *:443 *:* users:((caddy))\\n"\n' >"$scratch/caddy-gate/ss"
printf '#!/bin/bash\necho PACKAGE_GATE_REACHED\nexit 88\n' >"$scratch/caddy-gate/apt-get"
chmod 755 "$scratch/caddy-gate/ss" "$scratch/caddy-gate/apt-get"
mkdir -p /etc/caddy /etc/systemd/system
printf 'foreign.example.test { reverse_proxy localhost:5678; }\n' >/etc/caddy/Caddyfile
foreign_hash=$(sha256sum /etc/caddy/Caddyfile)
if PATH="$scratch/caddy-gate" /bin/bash "$setup" bops.example.test /unused >"$scratch/foreign-caddy.log" 2>&1; then fail 'foreign Caddy accepted'; fi
grep -q 'not this Bops' "$scratch/foreign-caddy.log" || fail 'foreign Caddy diagnostic'
! grep -q PACKAGE_GATE_REACHED "$scratch/foreign-caddy.log" || fail 'foreign Caddy reached mutations'
[[ $(sha256sum /etc/caddy/Caddyfile) == "$foreign_hash" ]] || fail 'foreign Caddy changed'
printf '#!/bin/bash\nexit 0\n' >"$scratch/caddy-gate/ss"
if PATH="$scratch/caddy-gate" /bin/bash "$setup" bops.example.test /unused >"$scratch/stopped-caddy.log" 2>&1; then fail 'stopped foreign Caddy accepted'; fi
grep -q 'not this Bops' "$scratch/stopped-caddy.log" || fail 'stopped foreign Caddy diagnostic'
! grep -q PACKAGE_GATE_REACHED "$scratch/stopped-caddy.log" || fail 'stopped foreign Caddy reached mutations'
[[ $(sha256sum /etc/caddy/Caddyfile) == "$foreign_hash" ]] || fail 'stopped foreign Caddy changed'
printf '#!/bin/bash\nprintf "LISTEN 0 4096 *:443 *:* users:((caddy))\\n"\n' >"$scratch/caddy-gate/ss"
printf '# Managed by Bops vps-setup.sh\nbops.example.test {\n    reverse_proxy 127.0.0.1:3210\n}\n' >/etc/caddy/Caddyfile
printf 'WorkingDirectory=/home/bops/bops\nExecStart=/usr/bin/npx next start --port 3210 -H 127.0.0.1\n' >/etc/systemd/system/bops.service
if PATH="$scratch/caddy-gate" /bin/bash "$setup" bops.example.test /unused >"$scratch/owned-caddy.log" 2>&1; then fail 'package gate did not stop owned fixture'; fi
grep -q PACKAGE_GATE_REACHED "$scratch/owned-caddy.log" || fail 'owned Caddy rerun rejected'
printf '\nforeign.example.test { reverse_proxy localhost:5678; }\n' >>/etc/caddy/Caddyfile
if PATH="$scratch/caddy-gate" /bin/bash "$setup" bops.example.test /unused >"$scratch/mixed-caddy.log" 2>&1; then fail 'mixed Caddy accepted'; fi
! grep -q PACKAGE_GATE_REACHED "$scratch/mixed-caddy.log" || fail 'mixed Caddy reached mutations'
rm /etc/systemd/system/bops.service
pass 'foreign/stopped/mixed Caddy refused; exact owned configuration passes preflight'

# Infrastructure for test listeners and local fixture; sudo deliberately NOT preinstalled.
apt-get update -y >"$scratch/bootstrap.log" 2>&1
apt-get install -y git python3 iproute2 ca-certificates >>"$scratch/bootstrap.log" 2>&1
command -v sudo >/dev/null && fail 'base unexpectedly includes sudo; cannot test dependency installation'
python3 -u - <<'PY' >"$scratch/listeners.log" 2>&1 &
import socket, time
sockets = []
for port in (80, 443):
    sock = socket.socket()
    sock.bind(('0.0.0.0', port))
    sock.listen()
    sockets.append(sock)
print('ready', flush=True)
while True: time.sleep(1)
PY
listener_pid=$!
for _ in $(seq 1 30); do grep -q ready "$scratch/listeners.log" && break; sleep 0.1; done
grep -q ready "$scratch/listeners.log" || fail 'test listeners failed'
mkdir -p /etc/caddy /etc/traefik /opt/n8n
printf 'existing Caddy configuration\n' >/etc/caddy/Caddyfile
printf 'existing Traefik configuration\n' >/etc/traefik/traefik.yml
printf 'existing n8n data sentinel\n' >/opt/n8n/sentinel
sha256sum /etc/caddy/Caddyfile /etc/traefik/traefik.yml /opt/n8n/sentinel >"$scratch/public.sha"
before_packages=$(sha256sum /var/lib/dpkg/status)
if bash "$setup" bops.example.test /unused >"$scratch/occupied.log" 2>&1; then
  fail 'public setup accepted occupied ports'
fi
grep -q 'already listening' "$scratch/occupied.log" || fail 'occupied-port diagnostic'
[[ $(sha256sum /var/lib/dpkg/status) == "$before_packages" ]] || fail 'guard changed installed packages'
[[ ! -e /home/bops ]] || fail 'guard created bops user home'
pass 'real listeners on 80/443 refuse public setup before package changes'

# Only service control and tailnet membership are simulated. Fail on unexpected commands.
cat >/usr/local/bin/systemctl <<'SH'
#!/bin/bash
printf '%s\n' "$*" >>/tmp/bops-systemctl.calls
case "$*" in 'daemon-reload'|'enable bops'|'restart bops') exit 0;; *) exit 91;; esac
SH
cat >"$scratch/tailscale-fixture" <<'SH'
#!/bin/bash
printf '%s\n' "$*" >>/tmp/bops-tailscale.calls
case "$*" in
  # Logged out until an unattended up with the required flags and a private key file.
  'status --peers=false') [[ -f /tmp/bops-tailscale.up ]];;
  'up --accept-dns=false --netfilter-mode=off --auth-key=file:'*)
    key=${*##*--auth-key=file:}
    [[ $(stat -c '%a' "$key") == 600 && $(cat "$key") == tskey-fixture ]] || exit 94
    printf '%s\n' "$key" >/tmp/bops-tailscale.up;;
  'debug prefs') printf '{"CorpDNS":false,"NetfilterMode":0}\n';;
  'status --json') printf '{"Self":{"DNSName":"fixture.example.ts.net."},"CertDomains":["fixture.example.ts.net"]}\n';;
  'serve --bg --https=443 http://127.0.0.1:3210') exit 0;;
  *) exit 92;;
esac
SH
chmod 755 /usr/local/bin/systemctl "$scratch/tailscale-fixture"
# Let the installer discover no CLI, fetch the official repository and really install
# tailscale. Only after successful apt completion does the auth/serve fixture take over.
# Container package scripts normally skip systemd when /run/systemd/system is absent;
# unexpected direct systemctl calls fail the strict fixture rather than being swallowed.
export BOPS_TEST_TS_FIXTURE="$scratch/tailscale-fixture"
cat >/usr/local/bin/apt-get <<'SH'
#!/bin/bash
set -euo pipefail
printf '%s\n' "$*" >>/tmp/bops-apt.calls
/usr/bin/apt-get "$@"
if [[ $1 == install && " $* " == *' tailscale '* ]]; then
  /usr/bin/dpkg-query -W -f='${Status}\n' tailscale | grep -qx 'install ok installed'
  [[ -x /usr/bin/tailscale ]] || exit 93
  install -m 755 "$BOPS_TEST_TS_FIXTURE" /usr/local/bin/tailscale
fi
SH
chmod 755 /usr/local/bin/apt-get

fixture="$scratch/fixture"
mkdir -p "$fixture/app" "$fixture/scripts" "$fixture/config"
python3 - "$source_dir/package.json" "$fixture/package.json" <<'PY'
import json, sys
with open(sys.argv[1]) as source: deps = json.load(source)['dependencies']
with open(sys.argv[2], 'w') as target:
    json.dump({'private': True, 'dependencies': {k: deps[k] for k in ('next', 'react', 'react-dom')}}, target)
PY
printf 'export default function Layout({children}) { return <html><body>{children}</body></html>; }\n' >"$fixture/app/layout.js"
printf 'export default function Page() { return <main>Installer fixture</main>; }\n' >"$fixture/app/page.js"
printf 'BOPS_SELF_HOSTED=1\n' >"$fixture/.env.example"
printf '.env.local\n.data/\nnode_modules/\n.next/\n' >"$fixture/.gitignore"
printf 'fixture: original\n' >"$fixture/config/bops.yaml"
cp "$source_dir/scripts/pair-phone.mjs" "$fixture/scripts/pair-phone.mjs"
git -C "$fixture" init -b windows-port >/dev/null
git -C "$fixture" -c user.name=Fixture -c user.email=fixture@example.invalid add .
git -C "$fixture" -c user.name=Fixture -c user.email=fixture@example.invalid commit -m fixture >/dev/null
# Local source is owned by root; explicitly trust just this disposable fixture for cloning as bops.
git config --system --add safe.directory "$fixture/.git"
git config --system --add safe.directory "$fixture"

run_setup() {
  # Raw output may contain a synthetic pairing code. Keep it private inside disposable container;
  # never print the log, even on failure. Exit code + last stage are safe diagnostics.
  local log="$scratch/setup-$1.log"
  touch "$log"; chmod 600 "$log"
  if ! BOPS_TS_AUTHKEY=tskey-fixture BOPS_TAILSCALE=1 BOPS_BRANCH=windows-port bash "$setup" "$fixture" >"$log" 2>&1; then
    grep '^== ' "$log" >&2 || true
    fail "setup $1 failed (private log in disposable container)"
  fi
}
run_setup initial
command -v sudo >/dev/null || fail 'sudo dependency missing'
dpkg-query -W -f='${Status}\n' tailscale | grep -qx 'install ok installed' || fail 'real Tailscale package missing'
[[ -s /usr/share/keyrings/tailscale-archive-keyring.gpg && -s /etc/apt/sources.list.d/tailscale.list ]] || fail 'official Tailscale repository missing'
grep -qx 'install -y tailscale' /tmp/bops-apt.calls || fail 'Tailscale install branch skipped'
[[ $(node -p 'process.versions.node.split(".")[0]') -ge 22 ]] || fail 'Node version'
[[ -f /home/bops/bops/.next/BUILD_ID ]] || fail 'real Next build missing'
[[ $(stat -c '%a %U:%G' /home/bops/bops/.env.local) == '600 bops:bops' ]] || fail 'env permissions'
[[ $(stat -c '%a %U:%G' /home/bops/bops/.data/remote.json) == '600 bops:bops' ]] || fail 'pairing permissions'
grep -qx 'BOPS_REQUIRE_REMOTE=1' /home/bops/bops/.env.local || fail 'pairing enforcement'
grep -qx 'BOPS_PUBLIC_URL=https://fixture.example.ts.net' /home/bops/bops/.env.local || fail 'tailnet URL'
grep -Eq '^BOPS_SECRET_KEY=[a-f0-9]{64}$' /home/bops/bops/.env.local || fail 'generated secret format'
grep -qx 'ExecStart=/usr/bin/npx next start --port 3210 -H 127.0.0.1' /etc/systemd/system/bops.service || fail 'loopback binding'
node -e 'const p=JSON.parse(require("fs").readFileSync("/home/bops/bops/.data/remote.json")); if(!/^[a-f0-9]{64}$/.test(p.hash)||!Number.isFinite(p.created))process.exit(1)' || fail 'pair hash'
pass 'real packages, clone, Next build, private env and hashed pairing'
sha256sum /home/bops/bops/.env.local /home/bops/bops/.data/remote.json /home/bops/bops/config/bops.yaml >"$scratch/preserved.sha"
run_setup rerun
sha256sum --check --status "$scratch/preserved.sha" || fail 'rerun overwrote env/config/pairing'
sha256sum --check --status "$scratch/public.sha" || fail 'public service configuration changed'
kill -0 "$listener_pid" || fail 'existing listener stopped'
[[ $(ss -H -ltn 'sport = :80 or sport = :443' | wc -l) == 2 ]] || fail 'public listeners changed'
[[ $(grep -c '^serve --bg --https=443 http://127.0.0.1:3210$' /tmp/bops-tailscale.calls) == 2 ]] || fail 'tailnet serve invocation'
[[ $(grep -c '^up --accept-dns=false --netfilter-mode=off --auth-key=file:' /tmp/bops-tailscale.calls) == 1 ]] || fail 'tailscale up flags / single sign-in'
! grep -q 'tskey-fixture' /tmp/bops-tailscale.calls || fail 'auth key reached tailscale argv'
[[ ! -e $(cat /tmp/bops-tailscale.up) ]] || fail 'auth key file left behind'
grep -q 'https://fixture.example.ts.net' "$scratch/setup-rerun.log" || fail 'tailnet URL not printed'
grep -q 'MagicDNS and HTTPS Certificates' "$scratch/setup-rerun.log" || fail 'MagicDNS/HTTPS note missing'
[[ $(grep -c '^restart bops$' /tmp/bops-systemctl.calls) == 2 ]] || fail 'service restart invocation'
! command -v caddy >/dev/null || fail 'tailnet mode installed Caddy'
pass 'rerun preserves env/config/pairing and public service sentinels/listeners'
echo 'PASS: installer dry-run complete; systemd, tailnet auth/TLS, real n8n/Traefik and full Bops runtime remain untested.'
