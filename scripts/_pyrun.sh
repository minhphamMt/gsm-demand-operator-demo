#!/usr/bin/env bash
# Cross-platform Python launcher for AI log hooks.
# Prefer the repository virtualenv so hook dependencies (notably
# python-dotenv) are available, then fall back to Python installations on PATH.
# Designed to be sourced or called as: bash scripts/_pyrun.sh <script> [args...]
#
# Exits 0 silently if no Python is found — hooks must never block the AI tool.
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PY=()

if [ -x "$REPO_DIR/.venv/Scripts/python.exe" ]; then
  PY=("$REPO_DIR/.venv/Scripts/python.exe")
elif [ -x "$REPO_DIR/.venv/bin/python" ]; then
  PY=("$REPO_DIR/.venv/bin/python")
elif command -v python3 >/dev/null 2>&1; then
  PY=(python3)
elif command -v python >/dev/null 2>&1; then
  PY=(python)
elif command -v py >/dev/null 2>&1; then
  PY=(py -3)
else
  # PATH lookup failed — probe standard Windows install locations.
  shopt -s nullglob 2>/dev/null || true
  for cand in \
    /c/Users/*/AppData/Local/Programs/Python/Python*/python.exe \
    "/c/Program Files/Python"*/python.exe \
    "/c/Program Files (x86)/Python"*/python.exe \
    /c/Python*/python.exe; do
    if [ -x "$cand" ]; then PY=("$cand"); break; fi
  done
  shopt -u nullglob 2>/dev/null || true
  [ "${#PY[@]}" -gt 0 ] || exit 0
fi

exec "${PY[@]}" "$@"
