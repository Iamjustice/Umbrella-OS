# Umbrella OS

Android TV web portal: stream a cloud/local Android emulator in the browser and control it with a virtual remote, keyboard, gamepad, or voice.

## Stack

- **android** — `budtmo/docker-android` (noVNC on 6080)
- **backend** — Express + WebSocket + ADB (`cryptoice1/umbrella-os-backend`)
- **frontend** — Next.js TV UI (`cryptoice1/umbrella-os-frontend`)
- **caddy** (prod) — single entry on port 80 for smart TVs

## Local (laptop)

```bash
docker compose pull
docker compose up -d
```

- Portal: http://localhost:3000  
- API: http://localhost:4000/api  
- Stream: http://localhost:6080  

## AWS EC2 (full stack for Hisense / any browser)

See **[DEPLOY-AWS.md](./DEPLOY-AWS.md)** — one instance, student Builder credits, `./deploy.sh`.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
# then open http://<PUBLIC_IP>/
```

## CI

Push to `main` builds and pushes backend + frontend images to Docker Hub (`cryptoice1/umbrella-os-*-latest`) via `.github/workflows/build.yml`.
