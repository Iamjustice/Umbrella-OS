#!/usr/bin/env bash
# Pull latest Hub images and (re)start full stack behind Caddy.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Pulling images"
docker compose -f docker-compose.yml -f docker-compose.prod.yml pull

echo "==> Starting stack"
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "==> Status"
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
echo
echo "Open http://$(curl -s --max-time 2 ifconfig.me || echo '<EC2_PUBLIC_IP>')/ on your TV browser."
