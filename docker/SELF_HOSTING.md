# Self-hosting Keepsake on a Raspberry Pi

Runs the prebuilt arm64 images. Don't build from source on the Pi — the image
compiles Rust (`monolith`) and whisper.cpp from scratch, which takes hours there
and is already done for you by CI.

## Requirements

- Pi 4 or 5, **8GB recommended**. Chrome is the memory hog, Meilisearch second.
- A **64-bit** OS. `uname -m` must print `aarch64`; a 32-bit Raspberry Pi OS
  cannot run these images at all.
- Docker with the Compose plugin.
- Storage on SSD/NVMe if you can. Crawled page archives and screenshots grow
  quickly, and SD cards wear out under that write pattern.

## Install

```sh
git clone https://github.com/HexPum/keepsake-ui.git
cd keepsake-ui/docker
./setup-selfhost.sh <pi-address>      # e.g. ./setup-selfhost.sh 192.168.1.42
docker compose up -d
```

`setup-selfhost.sh` writes `docker/.env` with freshly generated secrets. It
refuses to overwrite an existing one, because those secrets are the only copy —
losing `NEXTAUTH_SECRET` logs everyone out.

The address you pass is whatever a browser types to reach the Pi. Give it a
static DHCP lease first; if the address changes later, update `NEXTAUTH_URL` in
`docker/.env` and run `docker compose up -d` again.

First boot runs database migrations and takes a few minutes. Watch it with
`docker compose logs -f web`, and confirm it's up:

```sh
curl http://<pi-address>:3000/api/health
```

## Reaching it from your phone

Two independent clients, both talking to this one server:

**Your mobile UI** — the responsive layout in `apps/web`, which is where
`MobileBrowse` and `MobileSearchHome` live. Open `http://<pi-address>:3000` in
the phone's browser. Anything under a 640px viewport gets the mobile screens.

**The native app** — install Karakeep from the
[App Store](https://apps.apple.com/us/app/karakeep-app/id6479258022) or Play
Store, then set the server address to `http://<pi-address>:3000`. It's a pure
API client, so it works against your server unmodified. Note it ships upstream's
UI, not this fork's — your mobile screens are web-side and won't appear there.

## Updating

```sh
cd keepsake-ui/docker
docker compose pull && docker compose up -d
```

`KEEPSAKE_VERSION` defaults to `latest`, which is rebuilt on **every push to
main** — so a `pull` can hand you an untested commit. This fork publishes
`:release` only when you create a GitHub release; once you cut one, pin it in
`docker/.env`:

```sh
KEEPSAKE_VERSION=release
```

Back up `docker/.env` and the `data` volume before any update.

## Exposing it beyond your LAN

The default is plain HTTP, which is fine on a home network and not fine on the
open internet — sessions and API keys would cross it in cleartext.

Easiest safe option is a WireGuard or Tailscale tunnel: nothing is published,
and the Pi is reachable from your phone anywhere. Set `NEXTAUTH_URL` to the
tunnel address.

For a real public hostname, terminate TLS at a reverse proxy (Caddy is the
least effort) in front of port 3000, and set `NEXTAUTH_URL` to the `https://`
URL. Getting that wrong is the classic failure: sign-in appears to succeed, then
drops you back on `/signin`, because the redirect resolves against an address
the browser never used.

## Tuning for the Pi

Off by default and best left that way on this hardware:

- **ASR / whisper.cpp** (`CRAWLER_ASR_ENABLED`) — CPU transcription. Inert
  unless you also mount a model and point `CRAWLER_ASR_MODEL` at it.
- **Inference** (`OPENAI_API_KEY`) — tagging and summaries. Calls out to an API
  rather than running locally, so it costs the Pi little; enable it if you want
  those features.

If memory gets tight, Chrome is the first thing to cap. Add to the `chrome`
service in `docker-compose.yml`:

```yaml
    mem_limit: 2g
```

Full option list: https://docs.karakeep.app/configuration
