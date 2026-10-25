#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export KB_ROOT="${KB_ROOT:-$HOME/kb}"
export PORT="${PORT:-8124}"
export HOST="${HOST:-0.0.0.0}"
export BASE_PATH="${BASE_PATH:-/kb}"
exec node "$DIR/server.mjs"
