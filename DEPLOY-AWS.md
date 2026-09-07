# Deploy Umbrella OS — full stack on one AWS EC2

Goal: open the portal + Android emulator stream on a Hisense (or any) smart TV browser.

## What this uses

| Piece | Image / role |
| --- | --- |
| Android emulator + noVNC | `budtmo/docker-android:emulator_14.0` |
| Backend | `cryptoice1/umbrella-os-backend:latest` |
| Frontend | `cryptoice1/umbrella-os-frontend:latest` |
| Reverse proxy | `caddy:2` on ports **80/443** |

Same-origin routing (`/`, `/api`, `/ws`, `/novnc/`) means the TV only needs `http://<PUBLIC_IP>/`.

## Honest sizing (student Builder credits)

- **Free-tier `t2/t3.micro` will not work** for the emulator (RAM + CPU).
- Use **student / Builder credits** on a larger instance.
- **Minimum practical:** `t3.xlarge` (4 vCPU, 16 GB) + **40–80 GB** gp3 disk, Ubuntu 22.04 **x86_64**.
- Compose already sets `-gpu swiftshader_indirect` so the emulator can run **without nested KVM** (slower, but works on normal EC2). Bare-metal (`.metal`) is faster and costs more — skip unless you have credits to burn.

## 1. Launch the instance

1. AWS Console → EC2 → Launch instance.
2. Name: `umbrella-os`.
3. AMI: **Ubuntu Server 22.04 LTS (x86_64)**.
4. Instance type: **`t3.xlarge`** (or `t3.2xlarge` if credits allow).
5. Key pair: create/download one (you’ll SSH with it).
6. Network → Security group:
   - SSH `22` from your IP
   - HTTP `80` from `0.0.0.0/0` (TV needs this)
   - HTTPS `443` from `0.0.0.0/0` (optional for later TLS)
7. Storage: **60 GB gp3**.
8. Launch → copy **Public IPv4**.

## 2. Install Docker on the instance

SSH in:

```bash
ssh -i your-key.pem ubuntu@<PUBLIC_IP>
```

Then:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
# re-login so docker works without sudo
exit
```

SSH back in, then:

```bash
docker version
```

## 3. Clone and start Umbrella OS

```bash
git clone https://github.com/Iamjustice/Umbrella-OS.git
cd Umbrella-OS
chmod +x deploy.sh
./deploy.sh
```

First boot of the Android emulator can take **several minutes**. Watch:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f android
```

## 4. Open on the TV

On the Hisense (or phone/laptop) browser:

```text
http://<PUBLIC_IP>/
```

You should get the Umbrella portal; stream/control goes through the same host.

## 5. After you push code / CI builds new images

On the EC2 box:

```bash
cd ~/Umbrella-OS
git pull origin main
./deploy.sh
```

CI (`build.yml`) must have already pushed `cryptoice1/umbrella-os-backend:latest` and `cryptoice1/umbrella-os-frontend:latest` to Docker Hub.

## Cost control

- **Stop** the instance when you’re not using the TV (EC2 → Instance state → Stop). Credits still matter for EBS storage while stopped.
- **Terminate** when done with the experiment to avoid leftover disk charges.
- Do not leave `0.0.0.0/0` SSH open; restrict port 22 to your IP.

## If the emulator never becomes healthy

1. `docker logs umbrella-android` — look for boot / KVM / GPU messages.
2. Confirm instance has **≥8 GB free RAM** while running (`free -h`).
3. Wait 5–10 minutes on first start (system image download inside the container).
4. Still stuck: bump to `t3.2xlarge` or increase disk; soft GPU is CPU-heavy.
