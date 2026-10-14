#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"
export PIP_CACHE_DIR="${PIP_CACHE_DIR:-/tmp/carbons-pip-cache}"
export NPM_CONFIG_CACHE="${NPM_CONFIG_CACHE:-/tmp/carbons-npm-cache}"
export NEXT_TELEMETRY_DISABLED=1
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.lock
npm --prefix frontend ci --no-audit --no-fund
python3 infra/init_env.py
docker compose up -d --wait db
cd backend
../.venv/bin/alembic upgrade head
../.venv/bin/python -m app.manage seed
../.venv/bin/python - <<'PY'
import psycopg
from psycopg import sql
from sqlalchemy.engine import make_url
from app.config import get_settings
url = make_url(get_settings().database_url).set(drivername="postgresql")
with psycopg.connect(url.render_as_string(hide_password=False), autocommit=True) as conn:
    if not conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", ["carbons_test"]).fetchone():
        conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier("carbons_test")))
PY
echo "Dependencies, database, migrations, and catalog are ready."
