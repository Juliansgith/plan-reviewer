#!/bin/sh
# Deploys the current commit to a server over SSH: copies the committed
# source into a fresh release folder, builds the image there, restarts the
# container and waits for it to report healthy. Rolls nothing else.
#
#   deploy/deploy.sh <ssh-host> [base-dir]
#
# One-time server setup (nginx site and HTTPS) is in docs/DEPLOY.md.
set -eu

host=${1:?usage: deploy/deploy.sh <ssh-host> [base-dir]}
base=${2:-/opt/plan-reviewer}
cd "$(dirname "$0")/.."

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commit or stash your changes first; only committed code is deployed." >&2
  exit 1
fi
rev=$(git rev-parse --short HEAD)
release="$base/releases/$rev"

echo "Deploying $rev to $host:$release"
git archive --format=tar HEAD | ssh "$host" "mkdir -p '$release' && tar -x -C '$release'"
ssh "$host" "cd '$release' && docker compose -f deploy/compose.yaml up -d --build && ln -sfn '$release' '$base/current'"

echo "Waiting for the health check"
ssh "$host" 'for i in $(seq 1 60); do curl -fs http://127.0.0.1:8100/api/health >/dev/null && exit 0; sleep 1; done; exit 1'
echo "Deployed $rev"
