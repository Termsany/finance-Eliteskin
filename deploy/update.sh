#!/usr/bin/env bash
# تحديث المتابعة المالية لآخر نسخة على GitHub (البيانات والإعدادات ما بتتلمسش):
#   sudo bash /opt/elite-finance-v2/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."
git fetch -q origin main && git reset -q --hard origin/main
docker compose up -d --build
for i in $(seq 1 60); do curl -fs -m 3 http://127.0.0.1:3200/api/health >/dev/null 2>&1 && { echo "==> تم ✓ ($(git rev-parse --short HEAD))"; exit 0; }; sleep 3; done
echo "!! البرنامج ما ردّش بعد التحديث:"; docker compose logs --tail 80 app; exit 1
