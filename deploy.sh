#!/usr/bin/env bash
# Deploy the Shiori *system* from the dev repo to a local service root.
# Dev = this git repo; Service = $SHIORI_SERVICE_ROOT (no git, runtime files).
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DST="${SHIORI_SERVICE_ROOT:-$HOME/.local/share/shiori}"

mkdir -p "$DST"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'kb' \
  --exclude 'node_modules' \
  --exclude '__pycache__' \
  "$SRC/" "$DST/"

echo "deployed: $SRC -> $DST"

KB_ROOT="${SHIORI_KB_ROOT:-$HOME/kb}" \
SKILLS_DIR="${SHIORI_SKILLS_DIR:-$HOME/.agents/skills}" \
HERMES_SCRIPTS="${SHIORI_HERMES_SCRIPTS:-$HOME/.hermes/scripts}" \
  "$DST/install.sh"