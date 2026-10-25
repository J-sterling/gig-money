#!/usr/bin/env bash
# Suspend, resume, check or redeploy the Render service, to pay only while it runs.
# A suspended service isn't billed for compute; its disk (and data) is kept.
# Needs RENDER_API_KEY (in .env: scripts/key-from-vault.sh render_api_key RENDER_API_KEY).
# Usage: scripts/render.sh status|suspend|resume|deploy [service-name, default gig-money]
set -euo pipefail
cd "$(dirname "$0")/.."
[ -z "${RENDER_API_KEY:-}" ] && [ -f .env ] && RENDER_API_KEY=$(grep '^RENDER_API_KEY=' .env | cut -d= -f2- || true)
: "${RENDER_API_KEY:?RENDER_API_KEY is not set (see the comment at the top of this script)}"
ACTION="${1:-status}"
NAME="${2:-gig-money}"
API=https://api.render.com/v1
call() { curl -sS --fail-with-body -H "Authorization: Bearer $RENDER_API_KEY" -H "Accept: application/json" "$@"; }

ID=$(call "$API/services?name=$NAME&limit=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);process.stdout.write(r[0]?.service?.id??"")})')
[ -z "$ID" ] && { echo "No Render service named $NAME." >&2; exit 1; }

case "$ACTION" in
  status)
    call "$API/services/$ID" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=JSON.parse(s);console.log(`${v.name}: ${v.suspended} · ${v.serviceDetails?.url ?? ""} · plan ${v.serviceDetails?.plan ?? "?"}`)})' ;;
  suspend) call -X POST "$API/services/$ID/suspend" >/dev/null && echo "Suspended $NAME (no compute charges; data kept)." ;;
  resume)  call -X POST "$API/services/$ID/resume" >/dev/null && echo "Resuming $NAME; it takes a minute or two to come up." ;;
  deploy)  call -X POST -H "Content-Type: application/json" -d '{}' "$API/services/$ID/deploys" >/dev/null && echo "Deploy started for $NAME." ;;
  *) echo "Usage: $0 status|suspend|resume|deploy [service-name]" >&2; exit 2 ;;
esac
