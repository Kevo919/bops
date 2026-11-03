# Running Bops on a Hostinger VPS

Bops can run on a Linux server (a Hostinger **VPS**, KVM plan), always on, so your phone reaches it from anywhere without your PC being awake. Hostinger's **shared** or **web hosting** plans can't run it: Bops is a server that keeps running, and those plans only serve web pages.

What you get on a server: chat, your bots and their cloud computers (Orgo), routines, Slack/Telegram/Discord, email and phone. What you don't: bots working on your own PC (there is no PC there). The desktop app on your PC and the server are separate Bops; pick one as the one your phone uses.

## The quick way

On the VPS, as root (replace the domain and your fork's address):

```bash
curl -fsSL https://raw.githubusercontent.com/<you>/bops/windows-port/scripts/vps-setup.sh -o vps-setup.sh
sudo bash vps-setup.sh bops.example.com https://github.com/<you>/bops.git
```

It does every step below and prints a pairing code for your phone. To have the server share one Bops with your PC, run it as `sudo BOPS_SYNC=orgo bash vps-setup.sh …` and sign in with Orgo from your phone ([docs/sync.md](sync.md)). Then add your keys to `/home/bops/bops/.env.local` and `systemctl restart bops`. Run it again any time to update.

**The server already runs something on ports 80 and 443** (n8n behind Traefik, any Docker stack)? The setup refuses to touch those, on purpose. Use Tailscale mode instead: no domain, no Caddy, no public port. Your phone reaches the server over your Tailscale network:

```bash
sudo BOPS_TAILSCALE=1 bash vps-setup.sh https://github.com/<you>/bops.git
```

See [Sharing the server](#sharing-the-server-no-public-ports-tailscale) below for what it does and what you need on the phone.

The steps it takes, if you'd rather do them by hand:

## 1. The server

Ubuntu 24.04 on the VPS, then as root:

```bash
apt update && apt install -y git curl caddy
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs
useradd -m -s /bin/bash bops
```

## 2. Bops

```bash
sudo -iu bops
git clone https://github.com/<you>/bops.git && cd bops
git checkout windows-port
npm install --include=dev
cp .env.example .env.local
```

In `.env.local` set at least:

```bash
BOPS_SELF_HOSTED=1
OPENAI_API_KEY=...
OPENAI_EXECUTOR_API_KEY=...
ORGO_API_KEY=...
# Lets nothing in but your paired phone (and the webhooks that prove themselves):
BOPS_REQUIRE_REMOTE=1
# The key for saved logins and tokens (openssl rand -hex 32). Keep a copy somewhere safe.
BOPS_SECRET_KEY=...
BOPS_PUBLIC_URL=https://bops.example.com
```

Build it: `npx next build`.

## 3. Keep it running (systemd)

`/etc/systemd/system/bops.service`:

```ini
[Unit]
Description=Bops
After=network-online.target

[Service]
User=bops
WorkingDirectory=/home/bops/bops
ExecStart=/usr/bin/npx next start --port 3210 -H 127.0.0.1
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

`systemctl enable --now bops`. It listens on 127.0.0.1 only: the internet reaches it through Caddy below, never directly.

## 4. HTTPS (Caddy)

Point a domain (or a subdomain) at the VPS's IP in your DNS, then `/etc/caddy/Caddyfile`:

```
bops.example.com {
    reverse_proxy 127.0.0.1:3210
}
```

`systemctl reload caddy`. Caddy gets the certificate by itself.

## Sharing the server (no public ports: Tailscale)

For a VPS that already serves things on 80 and 443, Bops needs none of them. With `BOPS_TAILSCALE=1` the setup:

1. Installs Tailscale from its own apt repository and signs this server into your Tailscale account: it prints a login link and waits for you to open it (or pass `BOPS_TS_AUTHKEY` to do it unattended).
2. Runs Bops on 127.0.0.1 as always, and puts `tailscale serve` in front of it: Bops answers at `https://<this server's tailnet name>`, with a certificate Tailscale keeps, on the tailnet's 443 only. No public port, no Caddy, and nothing about n8n, Traefik or Docker changes.
3. Pairs your phone the same way; the address you enter in the app is the tailnet address.

On the phone, install Tailscale and sign in with the same account: the tailnet address then works from anywhere, home or mobile data. Only your tailnet's machines can reach Bops; nobody on the public internet can even see it.

By hand, the pieces are `tailscale up`, `tailscale serve --bg --https=443 http://127.0.0.1:3210`, and `BOPS_PUBLIC_URL=https://<tailnet name>` in `.env.local`.

## 5. Pair your phone

On the server: `cd ~/bops && node scripts/pair-phone.mjs`. It prints a pairing code once. In the Bops app on your phone, enter `https://bops.example.com` and that code. Run it again to pair a new phone (the old code stops working), or with `--off` to unpair.

## What the paired phone can do here

On a server there is no Bops window, so the paired phone is the owner: it can do everything, Settings included (on a PC, a few settings stay in the PC's window). Keep the code to yourself. Pages and files bots made are reachable by their long random links, as on a PC.

## Updating

```bash
sudo -iu bops && cd bops && git pull && npm install --include=dev && npx next build && exit
systemctl restart bops
```
