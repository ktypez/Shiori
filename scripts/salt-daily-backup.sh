#!/usr/bin/env bash
# Daily encrypted backup of the Hermes OKF bundle + state.db via Salt.
# Idempotent: seals, commits only if changed, prunes old snapshots, force-pushes to origin.
set -euo pipefail

export PATH="$HOME/.local/bin:$HOME/.local/go/bin:$PATH"

REPO=${REPO:-$HOME/my-backup-repo}
SRC=${SRC:-$HOME/kb}
DB=${DB:-$HOME/.hermes/state.db}

cd "$REPO"

# Seal the KB + a safe copy of the live SQLite DB.
salt seal --prune --sqlite "$DB" "$SRC" "$REPO"

# Commit only if the working tree changed.
if ! git diff --quiet -- .salt .gitattributes 2>/dev/null; then
  git add .salt .gitattributes
  git commit -m "salt settings changed"
fi

if [ -n "$(git status --porcelain)" ]; then
  git add .
  git commit -m "salt backup $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git push --force-with-lease origin master
  echo "backup: committed and pushed $(git rev-parse --short HEAD)"
else
  :  # nothing changed: stay silent (watchdog pattern)
fi
