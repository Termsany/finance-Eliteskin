#!/usr/bin/env bash
# المتابعة المالية v2 — تثبيت أو ترقية من النسخة الأولى (شغّله مرة واحدة كـ root):
#   curl -fsSL https://raw.githubusercontent.com/Termsany/finance-Eliteskin/main/deploy/install.sh | sudo bash
# - بيثبت Docker لو مش موجود، وبينزّل البرنامج في /opt/elite-finance-v2
# - بياخد كلمة المرور وسر الجلسات من .env النسخة الأولى، ويعمل باسورد لقاعدة البيانات
# - بيوقف النسخة الأولى ويشغّل الجديدة على نفس المنفذ 3200 (nginx والدومين زي ما هم)
# - المصاريف ومفتاح دفترة ومفتاح الذكاء الاصطناعي بيتنقلوا تلقائياً من data/db.json
# - لو النسخة الجديدة ما اشتغلتش، بيرجّع الأولى تلقائياً
set -euo pipefail
REPO=https://github.com/Termsany/finance-Eliteskin.git
NEW=/opt/elite-finance-v2
OLD=/opt/elite-finance
log() { echo "==> $*"; }

[ "$(id -u)" = 0 ] || { echo "شغّله بـ sudo"; exit 1; }
if ! command -v docker >/dev/null 2>&1; then log "تثبيت Docker"; curl -fsSL https://get.docker.com | sh; fi
docker compose version >/dev/null 2>&1 || { echo "docker compose مش موجود"; exit 1; }
command -v git >/dev/null 2>&1 || { apt-get update -qq && apt-get install -y -qq git; }

if [ -d "$NEW/.git" ]; then log "تحديث الكود"; git -C "$NEW" fetch -q origin main && git -C "$NEW" reset -q --hard origin/main
else log "تنزيل البرنامج في $NEW"; git clone -q "$REPO" "$NEW"; fi
cd "$NEW"

if [ ! -f .env ]; then
  log "إنشاء .env"
  rnd() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }
  oldv() { [ -f "$OLD/.env" ] && grep -E "^$1=" "$OLD/.env" | tail -1 | cut -d= -f2- || true; }
  PW="$(oldv APP_PASSWORD)"; SS="$(oldv SESSION_SECRET)"
  [ -n "$SS" ] && [ "$SS" != "change-me-to-a-long-random-string" ] || SS="$(rnd)"
  if [ -z "$PW" ] || [ "$PW" = "change-me-strong-password" ]; then PW="$(rnd | head -c 14)"; echo "!! كلمة مرور الدخول الجديدة: $PW  (غيّرها من الإعدادات بعد الدخول)"; fi
  LEG="$OLD/data"; [ -f "$LEG/db.json" ] || LEG="$NEW/legacy"
  mkdir -p "$NEW/legacy"
  cat > .env <<ENV
APP_PASSWORD='$PW'
SESSION_SECRET='$SS'
POSTGRES_PASSWORD='$(rnd)'
LEGACY_DATA_PATH=$LEG
SYNC_EVERY_MINUTES=60
ENV
  chmod 600 .env
fi

# النسخة الأولى: systemd أو docker
OLD_KIND=""
if systemctl is-active --quiet elite-finance 2>/dev/null; then OLD_KIND=systemd
elif [ -f "$OLD/docker-compose.yml" ] && docker compose -f "$OLD/docker-compose.yml" ps -q 2>/dev/null | grep -q .; then OLD_KIND=docker; fi

log "بناء النسخة الجديدة (أول مرة بتاخد كام دقيقة)"
docker compose build -q app

log "إيقاف النسخة الأولى ($OLD_KIND)"
case "$OLD_KIND" in
  systemd) systemctl stop elite-finance ;;
  docker) docker compose -f "$OLD/docker-compose.yml" down ;;
esac

docker compose up -d
for i in $(seq 1 60); do
  if curl -fs -m 3 http://127.0.0.1:3200/api/health >/dev/null 2>&1; then
    [ "$OLD_KIND" = systemd ] && systemctl disable --quiet elite-finance || true
    log "تم ✓ — البرنامج الجديد شغال على نفس العنوان. سجل الإقلاع:"
    docker compose logs --tail 15 app
    exit 0
  fi
  sleep 3
done

echo "!! النسخة الجديدة ما اشتغلتش — بارجّع الأولى"
docker compose logs --tail 80 app || true
docker compose down || true
case "$OLD_KIND" in
  systemd) systemctl start elite-finance ;;
  docker) docker compose -f "$OLD/docker-compose.yml" up -d ;;
esac
exit 1
