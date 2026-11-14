#!/usr/bin/env bash
# تحديث البرنامج دون المساس بـ .env ولا البيانات.
set -e
APP_DIR=/opt/elite-finance
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "==> تحديث الملفات (مع الحفاظ على .env و data)"
rsync -a --exclude node_modules --exclude data --exclude .env --exclude .git "$SRC_DIR"/ "$APP_DIR"/
cd "$APP_DIR"
npm install --omit=dev --no-audit --no-fund
chown -R www-data:www-data "$APP_DIR"
systemctl restart elite-finance
echo "==> تم. تابع:  journalctl -u elite-finance -f"
