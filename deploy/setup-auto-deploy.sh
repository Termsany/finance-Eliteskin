#!/usr/bin/env bash
# One-time setup so every merge to main updates «المالية» by itself (run as root on the server):
#   sudo bash /opt/elite-finance-v2/deploy/setup-auto-deploy.sh
# Creates a deploy key that can ONLY run deploy/auto-deploy.sh (forced command, no shell, no
# forwarding), then prints the two values to paste into GitHub → Settings → Secrets → Actions.
# Safe to run again: it reuses the same key.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "شغّله بـ sudo"; exit 1; }
APP="$(cd "$(dirname "$(readlink -f "$0")")/.." && pwd)"
KEY=/root/.ssh/elite_finance_deploy
SCRIPT="$APP/deploy/auto-deploy.sh"
chmod +x "$SCRIPT"
mkdir -p /root/.ssh && chmod 700 /root/.ssh
[ -f "$KEY" ] || ssh-keygen -q -t ed25519 -N "" -C "elite-finance-deploy" -f "$KEY"
LINE="command=\"$SCRIPT\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat "$KEY.pub")"
touch /root/.ssh/authorized_keys && chmod 600 /root/.ssh/authorized_keys
grep -qF "$(cut -d' ' -f2 "$KEY.pub")" /root/.ssh/authorized_keys || echo "$LINE" >> /root/.ssh/authorized_keys

# record the current version as deployed so the first automatic run only redeploys on a real change
git -C "$APP" rev-parse HEAD > "$APP/.git/deployed-sha"

HOST="$(curl -fs -m 5 https://api.ipify.org || hostname -I | awk '{print $1}')"
cat <<MSG

==> تم. حط القيمتين دول في GitHub:
    https://github.com/Termsany/finance-Eliteskin/settings/secrets/actions  ←  New repository secret

    الاسم:  FINANCE_DEPLOY_KEY_B64
    القيمة (سطر واحد طويل، انسخه كله):
$(base64 -w0 "$KEY")

    الاسم:  DEPLOY_HOST
    القيمة: $HOST

بعدها أي دمج على main هيحدّث «المالية» لوحده.
المفتاح ده ما يقدرش يعمل أي حاجة على السيرفر غير تشغيل تحديث «المالية».
MSG
