"""PostgreSQL outbox worker. Run one or more processes; rows are claimed with SKIP LOCKED."""

import time
from datetime import timedelta

import httpx
from sqlalchemy import select

from .config import get_settings
from .db import SessionLocal
from .integrations import mp_request, send_whatsapp
from .models import Event, Order, now
from .services import expire_orders


def tick():
    with SessionLocal() as db:
        expire_orders(db)
        db.commit()
        event = db.scalar(
            select(Event)
            .where(Event.status.in_(["pending", "retry"]), Event.next_attempt_at <= now())
            .order_by(Event.next_attempt_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if not event:
            return False
        order = db.get(Order, event.order_id)
        event.attempts += 1
        settings = get_settings()
        try:
            if event.kind == "whatsapp":
                if settings.demo_mode or not settings.whatsapp_enabled:
                    event.status, event.last_error = "blocked", "whatsapp_not_configured"
                else:
                    event.external_id = send_whatsapp(order, event)
                    event.status = "sent"
            elif event.kind == "refund":
                result = mp_request(
                    "POST", f"/v1/payments/{order.pix_id}/refunds", key=f"refund-{order.id}", payload={}
                )
                if result.get("status") != "approved":
                    raise RuntimeError("refund_not_approved")
                event.external_id = str(result["id"])
                event.status = "sent"
                order.payment_status = "refunded"
        except (httpx.ReadTimeout, httpx.RemoteProtocolError):
            # WhatsApp lacks an idempotency key: reconcile ambiguous sends instead of duplicating them.
            event.status = "uncertain" if event.kind == "whatsapp" else "retry"
            event.last_error = "provider_response_uncertain"
            event.next_attempt_at = now() + timedelta(minutes=5)
        except (httpx.HTTPError, RuntimeError, KeyError):
            event.status = "failed" if event.attempts >= 5 else "retry"
            event.last_error = "provider_request_failed"
            event.next_attempt_at = now() + timedelta(seconds=min(3600, 30 * 2**event.attempts))
        db.commit()
        return True


def main():
    get_settings().validate_production()
    while True:
        try:
            worked = tick()
            if not worked:
                time.sleep(3)
        except KeyboardInterrupt:
            return
        except Exception:
            # Do not include SQL parameters, tokens or customer data in logs.
            print("worker: database_or_processing_error; retrying", flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
