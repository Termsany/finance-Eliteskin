#!/usr/bin/env bash
# مثبّت برنامج المتابعة المالية على سيرفر Ubuntu/Debian.
# يشغَّل مرة واحدة من داخل مجلد المشروع:  sudo bash deploy/install.sh
set -e

APP_DIR=/opt/elite-finance
SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> تثبيت Node.js لو مش موجود"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node --version)"

echo "==> نسخ الملفات إلى $APP_DIR"
mkdir -p "$APP_DIR"
# ننسخ كل حاجة ما عدا node_modules والبيانات والـ .env القديم
rsync -a --exclude node_modules --exclude data --exclude .git "$SRC_DIR"/ "$APP_DIR"/ 2>/dev/null || cp -r "$SRC_DIR"/. "$APP_DIR"/
cd "$APP_DIR"

echo "==> تثبيت الاعتماديات"
npm install --omit=dev --no-audit --no-fund

echo "==> تجهيز ملف الإعدادات .env"
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo "   أُنشئ .env — لازم تعدّله وتحط فيه بيانات دفترة والمفاتيح قبل التشغيل."
fi

echo "==> صلاحيات"
mkdir -p "$APP_DIR/data"
chown -R www-data:www-data "$APP_DIR"

echo "==> تثبيت خدمة systemd"
cp "$APP_DIR/deploy/elite-finance.service" /etc/systemd/system/elite-finance.service
systemctl daemon-reload
systemctl enable elite-finance

cat <<MSG

======================================================
تم التثبيت. الخطوات الأخيرة:

1) عدّل الإعدادات:   nano $APP_DIR/.env
   - DAFTRA_SUBDOMAIN و DAFTRA_APIKEY   (من دفترة)
   - APP_PASSWORD و SESSION_SECRET      (غيّرهم)
   - ANTHROPIC_API_KEY                  (اختياري، للـ AI)

2) شغّل البرنامج:    systemctl restart elite-finance
   تابع الحالة:      systemctl status elite-finance
   تابع اللوج:       journalctl -u elite-finance -f

3) Nginx (للوصول من المتصفح):
   cp $APP_DIR/deploy/nginx.conf.example /etc/nginx/sites-available/elite-finance
   nano /etc/nginx/sites-available/elite-finance   # غيّر الدومين
   ln -s /etc/nginx/sites-available/elite-finance /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   certbot --nginx -d finance.eliteskinsa.com      # شهادة HTTPS

البرنامج يعمل داخليًا على المنفذ المحدد في .env (الافتراضي 3200).
======================================================
MSG
