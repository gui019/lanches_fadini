import copy
import secrets
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select, update

from app.config import get_settings
from app.db import SessionLocal
from app.models import Batch, History, Order
from app.services import operation


def test_real_catalog_and_safe_configuration(client):
    result = client.get("/api/v1/catalog").json()
    assert len(result["products"]) == 6
    assert [p["price"] for p in result["products"]] == [2800, 2600, 3800, 3200, 3600, 4000]
    assert result["stock"]["available"] == 40
    assert not result["operation"]["pix_enabled"]


@pytest.mark.parametrize(
    "at,opened,date",
    [
        ("2026-10-12T17:59:00+00:00", False, "2026-10-16"),
        ("2026-10-12T18:00:00+00:00", True, "2026-10-16"),
        ("2026-10-15T23:00:00+00:00", True, "2026-10-16"),
        ("2026-10-16T20:59:00+00:00", False, "2026-10-16"),
        ("2026-10-16T21:00:00+00:00", True, "2026-10-16"),
        ("2026-10-17T00:29:59+00:00", True, "2026-10-16"),
        ("2026-10-17T00:30:00+00:00", False, "2026-10-23"),
        ("2026-10-17T15:00:00+00:00", False, "2026-10-23"),
    ],
)
def test_sao_paulo_schedule(monkeypatch, at, opened, date):
    monkeypatch.setattr(get_settings(), "demo_mode", False)
    op = operation(datetime.fromisoformat(at))
    assert op["open"] is opened
    assert op["service_date"] == date


def test_cash_order_price_tracking_and_no_delivery_fee(client, create):
    response = create()
    assert response.status_code == 201
    result = response.json()
    token, order = result["token"], result["order"]
    assert len(token) == 64
    assert order["total"] == 2800 and order["delivery_fee"] == 0
    assert order["status"] == "pending_approval"
    assert "pickup_address" not in order and "address" not in order and "phone" not in order
    assert client.get(f"/api/v1/orders/{token}").json()["code"] == order["code"]
    assert client.get("/api/v1/catalog").json()["stock"]["available"] == 39


def test_server_recalculates_and_counts_extra_patties(client, payload, create):
    payload["items"][0].update(
        quantity=2,
        removed=["Queijo prato"],
        additions={"hamburguer": 2, "bacon": 1},
        addition_versions={"hamburguer": 1, "bacon": 1},
    )
    payload["expected_total"] = 9200
    result = create().json()["order"]
    assert result["subtotal"] == (2800 + 700 * 2 + 400) * 2
    assert client.get("/api/v1/catalog").json()["stock"]["available"] == 34


@pytest.mark.parametrize("quantity", [0, -1, 11, 1.5, True])
def test_item_quantity_bounds(payload, create, quantity):
    payload["items"][0]["quantity"] = quantity
    assert create().status_code == 422


def test_total_order_limit(payload, create):
    payload["items"] *= 2
    payload["items"][0]["quantity"] = 6
    assert create().status_code == 400


@pytest.mark.parametrize("count", [0, 6, -1, 2.5, True])
def test_additional_bounds(payload, create, count):
    payload["items"][0]["additions"] = {"bacon": count}
    assert create().status_code == 422


def test_five_additions_are_accepted(payload, create):
    payload["items"][0].update(additions={"bacon": 5}, addition_versions={"bacon": 1})
    payload["expected_total"] += 2000
    assert create().status_code == 201


def test_tampered_total_does_not_reserve_stock(client, payload, create):
    payload["expected_total"] = 1
    assert create().status_code == 409
    assert client.get("/api/v1/catalog").json()["stock"]["available"] == 40


def test_removal_does_not_reduce_price(payload, create):
    payload["items"][0]["removed"] = ["Queijo prato"]
    payload["expected_total"] = 2500
    assert create().status_code == 409


def test_invalid_ingredient_and_addon(payload, create):
    payload["items"][0]["removed"] = ["Inventado"]
    assert create().status_code == 400
    payload["items"][0]["removed"] = []
    payload["items"][0]["additions"] = {"inventado": 1}
    assert create().status_code == 409


def test_idempotent_create_and_conflicting_payload(payload, create, client):
    key = secrets.token_hex(20)
    first, second = create(key=key), create(key=key)
    assert first.status_code == second.status_code == 201
    assert first.json()["token"] == second.json()["token"]
    assert client.get("/api/v1/catalog").json()["stock"]["available"] == 39
    payload["customer_name"] = "Outro Cliente"
    assert create(key=key).status_code == 409


def test_fifty_clients_compete_for_last_unit(client, payload):
    with SessionLocal() as db:
        db.execute(update(Batch).values(capacity=1, available=1))
        db.commit()

    def purchase(_):
        return client.post(
            "/api/v1/orders", json=copy.deepcopy(payload), headers={"Idempotency-Key": secrets.token_hex(20)}
        ).status_code

    with ThreadPoolExecutor(max_workers=20) as executor:
        statuses = list(executor.map(purchase, range(50)))
    assert statuses.count(201) == 1
    assert statuses.count(409) == 49
    assert client.get("/api/v1/catalog").json()["stock"]["available"] == 0


def test_delivery_allowlist_and_rural_rejection(client, payload, create):
    payload.update(
        fulfillment="delivery",
        expected_total=3400,
        address={
            "street": "Rua de teste",
            "number": "10",
            "neighborhood": "Centro",
            "city": "Pirassununga",
            "cep": "13630-000",
            "area": "urban",
        },
    )
    assert create().json()["order"]["delivery_fee"] == 600
    payload["address"]["area"] = "rural"
    assert create().status_code == 400
    payload["address"].update(area="urban", city="Outra cidade")
    assert create().status_code == 400
    payload["address"].update(city="Pirassununga", cep="13639999")
    assert create().status_code == 400


def test_cancellation_idempotent_releases_original_batch(client, create):
    result = create().json()
    path = f"/api/v1/orders/{result['token']}/cancel"
    assert client.post(path).json()["status"] == "cancelled"
    assert client.post(path).json()["status"] == "cancelled"
    assert client.get("/api/v1/catalog").json()["stock"]["available"] == 40
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(History).where(History.status == "cancelled")) == 1


def test_cannot_cancel_automatically_after_preparing(client, create):
    result = create().json()
    with SessionLocal() as db:
        order = db.scalar(select(Order))
        order.status = "preparing"
        db.commit()
    response = client.post(f"/api/v1/orders/{result['token']}/cancel").json()
    assert response["status"] == "preparing" and response["cancel_requested"]
    assert client.get("/api/v1/catalog").json()["stock"]["available"] == 39


def test_price_version_conflict(admin, payload, create):
    assert (
        admin.patch("/api/v1/admin/products/classico-salada", json={"price": 3000, "version": 1}).status_code
        == 200
    )
    assert create().status_code == 409


def test_immutable_commercial_snapshot(admin, create):
    result = create().json()
    admin.patch("/api/v1/admin/products/classico-salada", json={"price": 9999, "version": 1})
    tracked = admin.get(f"/api/v1/orders/{result['token']}").json()
    assert tracked["total"] == 2800 and tracked["items"][0]["unit_price"] == 2800


def test_invalid_dates_phone_and_no_consent(payload, create):
    payload["service_date"] = "2026-99-99"
    assert create().status_code == 422
    payload["phone"] = "123"
    assert create().status_code == 422


def test_pix_disabled_does_not_reserve_stock(payload, create, client):
    payload.update(payment_method="pix", email="cliente@example.com")
    assert create().status_code == 503
    assert client.get("/api/v1/catalog").json()["stock"]["available"] == 40


def test_tracking_invalid_token_and_expired_link(client, create):
    assert client.get("/api/v1/orders/invalid").status_code == 404
    result = create().json()
    with SessionLocal() as db:
        batch = db.scalar(select(Batch))
        batch.service_date = datetime.now(UTC).date() - timedelta(days=8)
        db.commit()
    assert client.get(f"/api/v1/orders/{result['token']}").status_code == 410
