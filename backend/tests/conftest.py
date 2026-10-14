import os
import secrets
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from fastapi.testclient import TestClient
from sqlalchemy import text

local = dotenv_values(Path(__file__).resolve().parents[2] / ".env")
url = os.environ.get("TEST_DATABASE_URL")
if not url:
    base = local.get("DATABASE_URL", "postgresql+psycopg://carbons:carbons@127.0.0.1:5432/carbons")
    url = base.rsplit("/", 1)[0] + "/carbons_test"
if not url.rsplit("/", 1)[-1].startswith("carbons_test"):
    raise RuntimeError("Tests require a dedicated database named carbons_test*.")
os.environ.update(
    DATABASE_URL=url,
    TOKEN_SECRET=secrets.token_urlsafe(48),
    DEMO_MODE="true",
    APP_ENV="test",
    PUBLIC_URL="http://localhost:3000",
    COOKIE_SECURE="false",
)

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app, rate_buckets  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def migrate():
    command.upgrade(Config("alembic.ini"), "head")


@pytest.fixture(autouse=True)
def clean_database(migrate):
    names = ", ".join('"' + table.name + '"' for table in Base.metadata.sorted_tables)
    with engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    with SessionLocal() as db:
        seed(db)
    rate_buckets.clear()


@pytest.fixture
def client():
    with TestClient(app, base_url="http://localhost:3000", headers={"X-CSRF-Protection": "1"}) as client:
        yield client


@pytest.fixture
def payload(client):
    catalog = client.get("/api/v1/catalog").json()
    return {
        "customer_name": "Cliente Teste",
        "phone": "19999999999",
        "fulfillment": "pickup",
        "payment_method": "cash",
        "service_date": catalog["operation"]["service_date"],
        "slot": "20:00",
        "items": [
            {
                "product_id": "classico-salada",
                "version": 1,
                "quantity": 1,
                "removed": [],
                "additions": {},
                "addition_versions": {},
            }
        ],
        "whatsapp_consent": False,
        "terms_accepted": True,
        "expected_total": 2800,
    }


@pytest.fixture
def create(client, payload):
    def run(data=None, key=None):
        return client.post(
            "/api/v1/orders", json=data or payload, headers={"Idempotency-Key": key or secrets.token_hex(20)}
        )

    return run


@pytest.fixture
def admin(client):
    import pyotp
    from app.models import Admin
    from app.security import password_hasher

    password, secret = secrets.token_urlsafe(24), pyotp.random_base32()
    with SessionLocal() as db:
        db.add(Admin(username="tester", password_hash=password_hasher.hash(password), totp_secret=secret))
        db.commit()
    response = client.post(
        "/api/v1/admin/auth/login",
        json={"username": "tester", "password": password, "otp": pyotp.TOTP(secret).now()},
    )
    assert response.status_code == 200
    return client
