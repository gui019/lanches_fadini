"""Isolated end-to-end runner. Never points migrations or test data at the application DB."""

import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import httpx
import psycopg
import pyotp
from alembic import command
from alembic.config import Config
from psycopg import sql
from sqlalchemy.engine import make_url

from .config import Settings


def wait_for(url, process):
    for _ in range(90):
        if process.poll() is not None:
            raise RuntimeError(
                "Test server exited before becoming ready; check carbons-e2e-*.log in the temporary directory."
            )
        try:
            if httpx.get(url, timeout=2).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    raise RuntimeError("Server readiness timed out.")


def main():
    settings = Settings()
    if not settings.demo_mode or settings.app_env == "production":
        raise SystemExit("Run E2E tests only in a local demonstration environment.")
    root = Path(__file__).resolve().parents[2]
    url = make_url(settings.database_url)
    test_name = "carbons_test_e2e"
    with psycopg.connect(
        url.set(drivername="postgresql").render_as_string(hide_password=False), autocommit=True
    ) as connection:
        if not connection.execute("SELECT 1 FROM pg_database WHERE datname = %s", [test_name]).fetchone():
            connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(test_name)))
    test_url = url.set(database=test_name).render_as_string(hide_password=False)
    os.environ.update(
        DATABASE_URL=test_url,
        TOKEN_SECRET=secrets.token_urlsafe(48),
        DEMO_MODE="true",
        PUBLIC_URL="http://localhost:3010",
        API_INTERNAL_URL="http://127.0.0.1:8010",
        NEXT_OUTPUT_DIR=".next-e2e",
        E2E_ADMIN_USER="e2e",
        E2E_ADMIN_PASSWORD=secrets.token_urlsafe(24),
        E2E_TOTP_SECRET=pyotp.random_base32(),
        E2E_PYTHON=sys.executable,
        E2E_API_URL="http://localhost:8010",
        PLAYWRIGHT_BASE_URL="http://localhost:3010",
        NEXT_TELEMETRY_DISABLED="1",
    )
    if shutil.which("chromium"):
        os.environ.setdefault("PLAYWRIGHT_CHROMIUM_EXECUTABLE", shutil.which("chromium"))
    os.environ.setdefault("NPM_CONFIG_CACHE", str(Path(tempfile.gettempdir()) / "carbons-npm-cache"))
    from sqlalchemy import text
    from .db import Base, SessionLocal, engine
    from .models import Admin
    from .security import password_hasher
    from .seed import seed

    command.upgrade(Config(str(root / "backend/alembic.ini")), "head")
    with engine.begin() as conn:
        tables = ", ".join('"' + t.name + '"' for t in Base.metadata.sorted_tables)
        conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    with SessionLocal() as db:
        seed(db)
        db.add(
            Admin(
                username="e2e",
                password_hash=password_hasher.hash(os.environ["E2E_ADMIN_PASSWORD"]),
                totp_secret=os.environ["E2E_TOTP_SECRET"],
            )
        )
        db.commit()
    processes, logs = [], []
    try:
        for name, cmd, cwd, health in [
            (
                "api",
                [sys.executable, "-m", "uvicorn", "app.main:app", "--port", "8010", "--no-access-log"],
                root / "backend",
                "http://localhost:8010/health",
            ),
            (
                "web",
                [
                    shutil.which("node"),
                    str(root / "frontend/node_modules/next/dist/bin/next"),
                    "dev",
                    "--port",
                    "3010",
                ],
                root / "frontend",
                "http://localhost:3010",
            ),
        ]:
            log = open(Path(tempfile.gettempdir()) / f"carbons-e2e-{name}.log", "w")
            logs.append(log)
            proc = subprocess.Popen(
                cmd, cwd=cwd, stdout=log, stderr=log, env=os.environ.copy(), start_new_session=True
            )
            processes.append(proc)
            wait_for(health, proc)
        result = subprocess.run(
            [shutil.which("node"), str(root / "frontend/node_modules/@playwright/test/cli.js"), "test"],
            cwd=root / "frontend",
            env=os.environ.copy(),
        )
        return result.returncode
    finally:
        import signal

        for proc in reversed(processes):
            if proc.poll() is None:
                if os.name == "nt":
                    subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
                    continue
                os.killpg(proc.pid, signal.SIGTERM)
                try:
                    proc.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    os.killpg(proc.pid, signal.SIGKILL)
        for log in logs:
            log.close()


if __name__ == "__main__":
    raise SystemExit(main())
