#!/usr/bin/env bash
# Install Shiori's *system* files into the standard live locations.
# This script never touches the knowledge data bundle (~/kb); it only copies
# code, templates, skills, and the agent contract (if missing).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
KB_DIR="${KB_ROOT:-$HOME/kb}"
SKILLS_DIR="${SKILLS_DIR:-$HOME/.agents/skills}"
HERMES_SCRIPTS="${HERMES_SCRIPTS:-$HOME/.hermes/scripts}"

echo "Shiori system install"
echo "  repo:    $REPO_DIR"
echo "  KB data: $KB_DIR  (not modified, except AGENTS.md if missing)"
echo

# 1. upkeep skill
mkdir -p "$SKILLS_DIR"
if [ -d "$SKILLS_DIR/kb-upkeep" ]; then
  echo "skill kb-upkeep already exists; leaving it in place (update manually if needed)"
else
  cp -r "$REPO_DIR/skills/kb-upkeep" "$SKILLS_DIR/"
  echo "installed skill: $SKILLS_DIR/kb-upkeep"
fi

# 2. salt daily backup script
mkdir -p "$HERMES_SCRIPTS"
cp "$REPO_DIR/scripts/salt-daily-backup.sh" "$HERMES_SCRIPTS/salt-daily-backup.sh"
chmod +x "$HERMES_SCRIPTS/salt-daily-backup.sh"
echo "installed script: $HERMES_SCRIPTS/salt-daily-backup.sh"

# 3. kbreader (optional)
if [ -d "$REPO_DIR/kbreader" ]; then
  echo "kbreader available at $REPO_DIR/kbreader (optional; run 'cd kbreader && pnpm install && ./start.sh')"
fi

# 4. agent contract (only if missing, to avoid clobbering local edits)
if [ -d "$KB_DIR" ]; then
  if [ ! -f "$KB_DIR/AGENTS.md" ]; then
    cp "$REPO_DIR/AGENTS.md" "$KB_DIR/AGENTS.md"
    echo "installed AGENTS.md into $KB_DIR"
  else
    echo "AGENTS.md already exists in $KB_DIR; leaving it in place"
  fi
else
  echo "KB data dir not found at $KB_DIR; create it first (see docs/install.md)"
fi

# 5. opencode template (never overwrite live config)
cat <<EOF

opencode: merge manually
  template: $REPO_DIR/opencode/opencode.json
  target:   ~/.config/opencode/opencode.json
  Add the 'instructions' and 'skills' keys; keep your own providers/models.
EOF

echo
echo "Done. Data stays at $KB_DIR and is backed up via Salt, not this repo."