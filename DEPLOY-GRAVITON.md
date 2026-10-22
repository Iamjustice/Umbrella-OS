# Deploying Umbrella OS on AWS Graviton (arm64): Redroid + ws-scrcpy

> **Reconstructed, unverified.** This stack was first brought up by hand
> (`docker run` + `docker commit`) on an m7g.xlarge. This guide and
> `docker-compose.arm64.yml` were rebuilt from the session logs, not copied
> from the running box. Treat it as a starting point until a fresh deploy from
> this branch has been shown to work end to end.

This replaces the x86 `budtmo/docker-android` emulator (which needs nested virt /
`/dev/kvm`) with **Redroid 14** (Android in a container, using the host kernel's
binder) and streams it with **ws-scrcpy** instead of noVNC.

```
browser ──https──> caddy ──/api,/ws──> backend:4000 ──adb──> 172.18.0.1:5555 ─┐
                     ├──/scrcpy/*──> umbrella-scrcpy:8000 ──adb──> 172.18.0.1:5555 ─┤
                     └──/*────────> frontend:3000                                  │
                                                     host :5555 <── redroid ───────┘
```

| Piece | Value used |
|---|---|
| Instance | m7g.xlarge (Graviton3, 4 vCPU / 16 GiB), Ubuntu 24.04 arm64 |
| Kernel | `7.0.0-1012-aws` (needs `binder_linux`; ashmem not available → `use_memfd=1`) |
| Android | `redroid/redroid:14.0.0_64only-latest` (seen as `sha256:0a611199…69aa`) |
| Stream | ws-scrcpy `0.9.0-dev`, built natively for arm64 (`ws-scrcpy/`) |
| TLS | Caddy 2 + Let's Encrypt on an `sslip.io` hostname |

## 0. Security group

Open only **22** (your IP), **80** and **443**. Do **not** open **5555** (ADB,
unauthenticated root shell into Android) or **8000** (ws-scrcpy, no auth).
Redroid has to publish 5555 on the host so the gateway address works; the
security group is what keeps it private.

## 1. Host setup (once)

```bash
# Clock: a skewed clock broke apt ("Release file ... not valid yet") on first boot.
sudo timedatectl set-ntp true
sudo systemctl restart systemd-timesyncd

# Docker Engine + compose + buildx from Docker's apt repo
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu   # log out and back in

# Optional: host adb for debugging
sudo apt-get install -y adb
```

### Binder (required by Redroid)

```bash
sudo modprobe binder_linux devices="binder,hwbinder,vndbinder" || sudo modprobe binder_linux
sudo mkdir -p /dev/binderfs
mountpoint -q /dev/binderfs || sudo mount -t binder binder /dev/binderfs

# Persist across reboots
echo "binder /dev/binderfs binder defaults 0 0" | sudo tee -a /etc/fstab
echo binder_linux | sudo tee /etc/modules-load.d/binder.conf

ls /dev/binderfs        # expect binder-control (and binder, hwbinder, vndbinder)
mkdir -p ~/redroid-data # Android /data lives here
```

If `modprobe binder_linux` fails, install the extra modules for your kernel:
`sudo apt-get install -y linux-modules-extra-$(uname -r)`.

## 2. Configure

```bash
git clone https://github.com/Iamjustice/Umbrella-OS.git && cd Umbrella-OS
git checkout feat/graviton-redroid-scrcpy
cp .env.arm64.example .env
# Edit .env: UMBRELLA_HOST=<a-b-c-d>.sslip.io for your Elastic IP a.b.c.d
docker compose -f docker-compose.arm64.yml config >/dev/null && echo OK
```

`umbrella-net` is pinned to `172.18.0.0/16` with gateway `172.18.0.1`. That
gateway is the ADB address for backend and ws-scrcpy, and it is part of the
stream link's `udid`. If you change `ANDROID_GATEWAY`, the backend `STREAM_URL`
follows automatically. If you set `NEXT_PUBLIC_ANDROID_UDID` at frontend build
time, change it there too. (Redroid's own container IP gave
`No route to host` for adb, which is why the gateway is used.)

## 3. Build (natively on the Graviton box)

The `cryptoice1/*:latest` images from CI are amd64 only, and the prebuilt
`aaronyes/ws-scrcpy` crashes (SIGSEGV) under QEMU. So all three images are built
on the instance:

```bash
docker compose -f docker-compose.arm64.yml build
# equivalent to:
#   docker build --build-arg NODE_IMAGE=node:20-bookworm-slim -t cryptoice1/umbrella-os-backend:arm64  ./backend
#   docker build --build-arg NODE_IMAGE=node:20-bookworm-slim -t cryptoice1/umbrella-os-frontend:arm64 ./frontend
#   docker build -t ws-scrcpy:arm64 ./ws-scrcpy      # clones NetrisTV/ws-scrcpy @ WS_SCRCPY_REF
```

## 4. Run

```bash
docker compose -f docker-compose.arm64.yml up -d
docker compose -f docker-compose.arm64.yml logs -f scrcpy   # expect "172.18.0.1:5555  device"
```

The first Android boot takes about 1–2 minutes. Check it:

```bash
adb connect 127.0.0.1:5555 && adb -s 127.0.0.1:5555 shell getprop sys.boot_completed   # 1
```

## 5. Verify

```bash
H=https://$UMBRELLA_HOST
curl -s  $H/api/status        # adbConnected:true, streamUrl "/scrcpy/#!action=stream&udid=172.18.0.1:5555&player=mse"
curl -sI $H/scrcpy/ | head -1 # 200
curl -sI $H/novnc/  | head -1 # 308 -> /scrcpy/
```

In the browser, open `https://$UMBRELLA_HOST/` and press **Stream** (or launch
an app). The portal now **navigates the whole tab** to
`/scrcpy/#!action=stream&udid=172.18.0.1:5555&player=mse`, because Safari would
not run ws-scrcpy inside the iframe. Use Back to return to the portal.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| ws-scrcpy device list empty | `ADB_HOST`/`ADB_PORT` set in the scrcpy container. adbkit treats them as the ADB *server*. They must be empty; use `REDROID_HOST`/`REDROID_PORT`. |
| scrcpy container just sleeps | You are running an old `docker commit` image with `CMD sleep`. Rebuild from `ws-scrcpy/`. |
| Redroid exits immediately | binderfs not mounted, or the container isn't privileged. Check `ls /dev/binderfs`. |
| `Unexpected next token after '{' on same line` | Caddy blocks must be multi-line. Keep `deploy/Caddyfile.arm64` as is. |
| apt `Release file ... is not valid yet` during build | Host clock skew. Enable NTP (step 1). |
| Backend can't see the device | Use `ANDROID_HOST` (not `ANDROID_ADB_HOST`) = gateway, `ANDROID_ADB_PORT=5555`. |
| Some apps open "not available" screens | App-side geo/region gating (seen with MovieBox), not a Redroid issue. |

## Rollback / x86

The x86 stack is untouched: `docker-compose.yml` + `docker-compose.prod.yml` +
`deploy/Caddyfile`. Backend/frontend Dockerfiles still default to
`node:20-bullseye-slim`; only the arm64 compose passes `bookworm`. The frontend
uses whatever `streamUrl` the backend advertises (`/api/status`), so the x86
deploy keeps its noVNC iframe via its existing `STREAM_URL`.
