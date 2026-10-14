import hashlib
import hmac
import secrets
import time
from datetime import timedelta
from unittest.mock import patch

import pytest
from sqlalchemy import func, select

from app.config import get_settings
from app.db import SessionLocal
from app.models import DeliveryRun, Event, History, Order, PaymentEvent, utc_now
from app.services import expire_orders


def test_admin_requires_auth_and_csrf(client):
    assert client.get("/api/v1/admin/orders").status_code == 401
    assert (
        client.post(
            "/api/v1/admin/auth/login",
            json={"username": "missing", "password": "wrong", "otp": "000000"},
            headers={"Origin": "https://evil.example"},
        ).status_code
        == 403
    )
    for _ in range(5):
        assert (
            client.post(
                "/api/v1/admin/auth/login", json={"username": "missing", "password": "wrong", "otp": "000000"}
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/v1/admin/auth/login", json={"username": "missing", "password": "wrong", "otp": "000000"}
        ).status_code
        == 429
    )


def test_admin_transition_and_payment_rules(admin, create):
    create()
    order = admin.get("/api/v1/admin/orders").json()["orders"][0]
    path = f"/api/v1/admin/orders/{order['id']}"
    assert admin.patch(path, json={"status": "preparing"}).status_code == 409
    assert admin.patch(path, json={"status": "confirmed"}).status_code == 400
    assert admin.patch(path, json={"status": "confirmed", "estimate": "20h30 às 21h"}).status_code == 200
    assert admin.patch(path, json={"status": "preparing"}).status_code == 200
    assert admin.patch(path, json={"status": "ready"}).status_code == 200
    assert admin.patch(path, json={"status": "dispatched"}).status_code == 400
    assert admin.patch(path, json={"status": "completed"}).status_code == 400
    assert admin.post(path + "/payment").status_code == 200
    assert admin.patch(path, json={"status": "completed"}).status_code == 200


def test_stock_cannot_drop_below_reserved(admin, create, payload):
    create()
    response = admin.post(
        "/api/v1/admin/inventory", json={"service_date": payload["service_date"], "capacity": 1}
    )
    assert response.status_code == 200
    assert create().status_code == 409
    assert admin.get("/api/v1/admin/inventory").json()["batches"][0]["available"] == 0


def test_pickup_address_only_after_confirmation(admin, create, monkeypatch):
    monkeypatch.setattr(get_settings(), "pickup_address", "Endereço privado de teste")
    result = create().json()
    assert "pickup_address" not in result["order"]
    order = admin.get("/api/v1/admin/orders").json()["orders"][0]
    admin.patch(f"/api/v1/admin/orders/{order['id']}", json={"status": "confirmed", "estimate": "20h"})
    assert (
        admin.get(f"/api/v1/orders/{result['token']}").json()["pickup_address"] == "Endereço privado de teste"
    )


def test_sales_reports_match_orders_and_csv(admin, payload, create):
    create()
    create()
    result = create().json()
    admin.post(f"/api/v1/orders/{result['token']}/cancel")
    report = admin.get("/api/v1/admin/reports/sales").json()
    assert report["orders"] == 2 and report["gross"] == 5600 and report["received"] == 0
    assert report["ranking"][0]["quantity"] == 2
    assert len(admin.get("/api/v1/admin/reports/sales.csv").text.splitlines()) == 4


def test_delivery_scope_expiration_and_revocation(admin, payload, create):
    payload.update(
        fulfillment="delivery",
        expected_total=3400,
        address={
            "street": "Rua Teste",
            "number": "1",
            "neighborhood": "Centro",
            "city": "Pirassununga",
            "cep": "13630000",
            "area": "urban",
        },
    )
    create()
    order = admin.get("/api/v1/admin/orders").json()["orders"][0]
    path = f"/api/v1/admin/orders/{order['id']}"
    for status in ["confirmed", "preparing", "ready"]:
        assert admin.patch(path, json={"status": status, "estimate": "20h30"}).status_code == 200
    run = admin.post(
        "/api/v1/admin/delivery-runs", json={"name": "Centro", "order_ids": [order["id"]]}
    ).json()
    route = admin.get(f"/api/v1/delivery/{run['token']}").json()
    assert len(route["stops"]) == 1
    assert route["stops"][0]["order_code"] == order["code"]
    stop_path = f"/api/v1/delivery/{run['token']}/stops/{route['stops'][0]['id']}"
    assert admin.post(stop_path, json={"status": "not_found"}).status_code == 200
    assert admin.post(stop_path, json={"status": "delivered"}).status_code == 200
    assert admin.post(stop_path, json={"status": "delivered"}).status_code == 200
    with SessionLocal() as db:
        delivered = db.get(Order, order["id"])
        assert delivered.status == "completed" and delivered.payment_status == "paid"
    with SessionLocal() as db:
        db.get(DeliveryRun, run["id"]).expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
    assert admin.get(f"/api/v1/delivery/{run['token']}").status_code == 410
    assert admin.post(f"/api/v1/admin/delivery-runs/{run['id']}/revoke").status_code == 200


@pytest.fixture
def pix_order(monkeypatch, payload, create):
    settings = get_settings()
    monkeypatch.setattr(settings, "demo_mode", False)
    monkeypatch.setattr(settings, "pickup_address", "Teste")
    monkeypatch.setattr(settings, "mercado_pago_access_token", "test_only")
    monkeypatch.setattr(settings, "mercado_pago_webhook_secret", "test_only_signature")
    # Keep a fixed open business window independent of the test runner's date.
    with patch(
        "app.services.get_operation_window",
        return_value={"open": True, "service_date": payload["service_date"]},
    ):
        payload.update(payment_method="pix", email="teste@example.com", whatsapp_consent=True)
        result = create().json()
    with SessionLocal() as db:
        order = db.scalar(select(Order))
        order.pix_id = "123456"
        db.commit()
        oid = order.id
    return {
        "result": result,
        "provider": {
            "id": 123456,
            "external_reference": oid,
            "transaction_amount": 28,
            "currency_id": "BRL",
            "payment_method_id": "pix",
            "status": "approved",
            "date_last_updated": "2026-10-14T00:00:00Z",
        },
    }


def signed_headers(timestamp=None):
    timestamp = str(timestamp or int(time.time()))
    request_id = secrets.token_hex(12)
    manifest = f"id:123456;request-id:{request_id};ts:{timestamp};"
    signature = hmac.new(
        get_settings().mercado_pago_webhook_secret.encode(), manifest.encode(), hashlib.sha256
    ).hexdigest()
    return {"x-request-id": request_id, "x-signature": f"ts={timestamp},v1={signature}"}


def test_three_webhooks_one_confirmation_one_outbox(client, pix_order):
    with patch("app.integrations.mercado_pago_request", return_value=pix_order["provider"]):
        for _ in range(3):
            assert (
                client.post(
                    "/api/v1/webhooks/mercado-pago?data.id=123456", headers=signed_headers()
                ).status_code
                == 200
            )
    with SessionLocal() as db:
        order = db.scalar(select(Order))
        assert order.payment_status == "paid" and order.status == "pending_approval"
        assert db.scalar(select(func.count()).select_from(PaymentEvent)) == 1
        assert db.scalar(select(func.count()).select_from(Event)) == 1
        assert (
            db.scalar(select(func.count()).select_from(History).where(History.status == "pending_approval"))
            == 1
        )


def test_untrusted_webhooks_rejected(client, pix_order):
    assert client.post("/api/v1/webhooks/mercado-pago?data.id=123456").status_code == 401
    assert (
        client.post(
            "/api/v1/webhooks/mercado-pago?data.id=123456", headers=signed_headers(int(time.time()) - 600)
        ).status_code
        == 401
    )
    with patch(
        "app.integrations.mercado_pago_request",
        return_value={**pix_order["provider"], "transaction_amount": 1},
    ):
        assert (
            client.post("/api/v1/webhooks/mercado-pago?data.id=123456", headers=signed_headers()).status_code
            == 409
        )


def test_expired_pix_releases_and_late_payment_refunds(client, pix_order):
    with SessionLocal() as db:
        order = db.scalar(select(Order))
        order.expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
        assert expire_orders(db) == 1
        db.commit()
    with patch("app.integrations.mercado_pago_request", return_value=pix_order["provider"]):
        for _ in range(2):
            assert (
                client.post(
                    "/api/v1/webhooks/mercado-pago?data.id=123456", headers=signed_headers()
                ).status_code
                == 200
            )
    with SessionLocal() as db:
        order = db.scalar(select(Order))
        assert order.status == "expired" and order.payment_status == "refund_pending"
        assert db.scalar(select(func.count()).select_from(Event).where(Event.kind == "refund")) == 1
    assert client.get("/api/v1/catalog").json()["stock"]["available"] == 40


def test_provider_outage_does_not_invalidate_order(client, payload, create):
    from app.worker import tick

    payload["whatsapp_consent"] = True
    create()
    with SessionLocal() as db:
        order = db.scalar(select(Order))
        db.add(Event(dedupe_key="test", order_id=order.id, kind="whatsapp", payload={"status": "confirmed"}))
        db.commit()
    assert tick()
    with SessionLocal() as db:
        assert db.scalar(select(Order)).status == "pending_approval"
        assert db.scalar(select(Event)).status == "blocked"


def test_manual_refund_and_report_consistency(admin, create):
    result = create().json()
    order = admin.get("/api/v1/admin/orders").json()["orders"][0]
    path = f"/api/v1/admin/orders/{order['id']}"
    assert admin.post(path + "/payment").status_code == 200
    assert admin.post(f"/api/v1/orders/{result['token']}/cancel").status_code == 200
    assert admin.get("/api/v1/admin/reports/sales").json()["refund_pending"] == 2800
    assert admin.post(path + "/refund-confirmed").status_code == 200
    report = admin.get("/api/v1/admin/reports/sales").json()
    assert report["refunded"] == 2800 and report["received"] == 0


def test_addon_version_change_blocks_old_cart(admin, payload, create):
    payload["items"][0].update(additions={"bacon": 1}, addition_versions={"bacon": 1})
    payload["expected_total"] = 3200
    response = admin.patch(
        "/api/v1/admin/add-ons/bacon", json={"name": "Bacon", "price": 450, "available": True, "version": 1}
    )
    assert response.status_code == 200
    assert create().status_code == 409
