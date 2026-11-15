#!/usr/bin/env bash
# «المالية» — brings the server to origin/main and redeploys. Run by the GitHub "Deploy to VPS"
# workflow over SSH (the deploy key is locked to this one script), and safe to run by hand.
#
# "Deployed" is the commit in .git/deployed-sha, written only after a build + health check passed,
# so a failed build is retried on the next push instead of being reported as up to date.
# Never force-resets over local history; only swaps containers after a successful build; puts the
# last good image back if the new one doesn't come up.
set -euo pipefail
SELF="$(readlink -f "$0")"
cd "$(dirname "$SELF")/.."

log() { echo "$(date -uIs) $*"; }
fail() { log "FAIL: $1"; exit 1; }
health() { curl -fs -m 3 http://127.0.0.1:3200/api/health >/dev/null 2>&1; }

# one deploy at a time
exec 9>.git/deploy.lock
flock -w 900 9 || fail "another deploy is still running after 15 min"

state_file=.git/deployed-sha
self_sum="$(sha1sum < "$SELF")"
git fetch origin main --quiet
remote_head="$(git rev-parse origin/main)"
deployed="$(cat "$state_file" 2>/dev/null || echo none)"

if [ "$deployed" = "$remote_head" ] && health; then
  log "up to date ($remote_head)"; exit 0
fi
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "uncommitted changes on the server — refusing to deploy over them"
git merge --ff-only origin/main --quiet || fail "the server's copy has diverged from GitHub — needs a manual look"

# this script may have just been updated: run the new version once so fixes apply now
if [ -z "${DEPLOY_REEXEC:-}" ] && [ "$(sha1sum < "$SELF")" != "$self_sum" ]; then
  log "deploy script changed — running the new version"
  exec 9>&-
  DEPLOY_REEXEC=1 exec bash "$SELF" "$@"
fi

log "deploying $deployed -> $remote_head"
docker image prune -f >/dev/null 2>&1 || true
docker builder prune -f --filter until=24h >/dev/null 2>&1 || true
log "disk: $(df -h / | awk 'NR==2{print $4" free of "$2}')"

docker compose up -d db
docker compose build app || fail "build failed for ${remote_head:0:7} — the running version is untouched"
docker compose up -d app

for i in $(seq 1 60); do
  if health; then
    echo "$remote_head" > "$state_file"
    docker image tag elite-finance-app elite-finance-app:good || true
    log "OK: deployed $remote_head, health check passed"
    # sync status for the job log (no secrets)
    docker compose exec -T db psql -qtA -U finance -d finance -c \
      "SELECT 'daftra sync: ok=' || coalesce(ok::text,'never') || ', finished=' || coalesce(finished_at::text,'never') || ', invoices=' || (SELECT count(*) FROM daftra_invoices) || ', message=' || message FROM daftra_sync WHERE id=1;" 2>/dev/null || true
    exit 0
  fi
  sleep 3
done

log "the new version did not come up — app logs:"
docker compose logs --no-color --tail 120 app 2>&1 || true
if docker image inspect elite-finance-app:good >/dev/null 2>&1; then
  log "rolling back to the last good image"
  docker image tag elite-finance-app:good elite-finance-app
  docker compose up -d --no-build app || true
  for i in $(seq 1 40); do health && { log "previous version is back up"; break; }; sleep 3; done
fi
fail "${remote_head:0:7} did not come up healthy — the previous version was put back; will retry on the next push"
