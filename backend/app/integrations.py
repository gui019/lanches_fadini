"""Provider adapters. No simulated success and no credentials sent to the browser."""

import hashlib
import hmac
import time
from decimal import Decimal

import httpx

from .config import get_settings
from .services import fail


def mercado_pago_request(method, path, *, key=None, payload=None):
    settings = get_settings()
    if not settings.pix_enabled:
        raise RuntimeError("pix_not_configured")
    headers = {"Authorization": f"Bearer {settings.mercado_pago_access_token}"}
    if key:
        headers["X-Idempotency-Key"] = key
    with httpx.Client(timeout=15) as client:
        response = client.request(method, f"https://api.mercadopago.com{path}", headers=headers, json=payload)
        response.raise_for_status()
        return response.json()


def create_pix(order):
    payment = mercado_pago_request(
        "POST",
        "/v1/payments",
        key=f"pix-{order.id}",
        payload={
            "transaction_amount": float(Decimal(order.total) / 100),
            "description": f"Carbon's Burguer — {order.code}",
            "payment_method_id": "pix",
            "payer": {"email": order.email},
            "external_reference": order.id,
            "date_of_expiration": order.expires_at.isoformat(),
            "notification_url": get_settings().public_url + "/api/v1/webhooks/mercado-pago",
        },
    )
    detail = payment.get("point_of_interaction", {}).get("transaction_data", {})
    if not detail.get("qr_code") or not detail.get("qr_code_base64"):
        raise RuntimeError("pix_invalid_response")
    order.pix_id = str(payment["id"])
    order.pix_data = {"copy_paste": detail["qr_code"], "qr_base64": detail["qr_code_base64"]}


def validate_mercado_pago_signature(data_id, request_id, signature, at=None):
    secret = get_settings().mercado_pago_webhook_secret
    if not secret or not data_id or not request_id:
        fail("Webhook não autorizado.", 401)
    try:
        parts = dict(part.strip().split("=", 1) for part in signature.split(","))
        timestamp = parts["ts"]
        seconds = int(timestamp) / 1000 if len(timestamp) > 10 else int(timestamp)
        if abs((at or time.time()) - seconds) > 300:
            fail("Evento expirado.", 401)
        manifest = f"id:{str(data_id).lower()};request-id:{request_id};ts:{timestamp};"
        expected = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, parts["v1"]):
            fail("Assinatura inválida.", 401)
    except (ValueError, KeyError):
        fail("Assinatura inválida.", 401)


def send_whatsapp(order, event):
    settings = get_settings()
    if settings.demo_mode or not settings.whatsapp_enabled:
        raise RuntimeError("whatsapp_not_configured")
    # The approved utility template must have exactly these three text parameters.
    payload = {
        "messaging_product": "whatsapp",
        "to": "55" + order.phone,
        "type": "template",
        "template": {
            "name": settings.whatsapp_template,
            "language": {"code": "pt_BR"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": order.code},
                        {"type": "text", "text": event.payload["status"]},
                        {
                            "type": "text",
                            "text": event.payload.get("estimate") or "Consulte seu acompanhamento",
                        },
                    ],
                }
            ],
        },
    }
    with httpx.Client(timeout=15) as client:
        response = client.post(
            f"https://graph.facebook.com/v23.0/{settings.whatsapp_phone_number_id}/messages",
            headers={"Authorization": f"Bearer {settings.whatsapp_access_token}"},
            json=payload,
        )
        response.raise_for_status()
        return response.json()["messages"][0]["id"]
