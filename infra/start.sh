#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"
if [[ ! -x .venv/bin/python || ! -f .env ]]; then
  echo "Execute bash infra/setup.sh primeiro." >&2
  exit 1
fi
docker compose up -d --wait db
cd backend
../.venv/bin/alembic upgrade head
../.venv/bin/python -m app.manage seed
cd ..
exec .venv/bin/python infra/start.py
