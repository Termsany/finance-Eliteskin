#!/usr/bin/env bash
# Update «المالية» to the latest version on GitHub by hand (data and settings are kept):
#   sudo bash /opt/elite-finance-v2/deploy/update.sh
# Same steps as the automatic deploy: build, health check, and the last good version back if it fails.
set -euo pipefail
exec bash "$(dirname "$(readlink -f "$0")")/auto-deploy.sh" "$@"
