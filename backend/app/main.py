import csv
import hashlib
import hmac
import io
import json
import secrets
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import date, timedelta
from decimal import Decimal

import httpx
from fastapi import Depends, FastAPI, Header, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import select, text

from . import integrations
from .config import get_settings
from .db import get_db
from .models import (
    AddOn,
    AdminSession,
    Audit,
    Batch,
    DeliveryRun,
    DeliveryStop,
    Event,
    Order,
    PaymentEvent,
    Product,
    utc_now,
)
from .schemas import AddOnPatch, DeliveryRunIn, LoginIn, OrderIn, ProductPatch, StatusIn, StockIn, StopIn
from .security import authenticate, require_admin
from .services import (
    TERMINAL,
    ensure_utc,
    cancel_order,
    create_order,
    hash_token,
    expire_orders,
    fail,
    find_order,
    get_inventory_batch,
    record_order_history,
    enqueue_order_notification,
    get_operation_window,
    serialize_order,
    transition_order_status,
)


@asynccontextmanager
async def lifespan(app):
    get_settings().validate_production()
    yield


app = FastAPI(title="Carbon's Burguer API", version="1.0.0", lifespan=lifespan)
rate_buckets = defaultdict(deque)


@app.middleware("http")
async def guard(request: Request, call_next):
    path = request.url.path
    if request.method in {"POST", "PATCH", "DELETE"} and "/webhooks/" not in path:
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") != get_settings().public_url.rstrip("/"):
            return JSONResponse({"detail": "Origem não autorizada."}, status_code=403)
        if path.startswith("/api/v1/admin") and request.headers.get("x-csrf-protection") != "1":
            return JSONResponse({"detail": "Proteção CSRF ausente."}, status_code=403)
    if request.method == "POST" and "/webhooks/" not in path:
        # Single API worker in the supplied Compose; shared proxy IP is limited conservatively.
        key = (
            request.client.host if request.client else "unknown",
            "login" if path.endswith("/login") else "mutation",
        )
        timestamp = time.monotonic()
        bucket = rate_buckets[key]
        while bucket and timestamp - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= (5 if key[1] == "login" else 200):
            return JSONResponse(
                {"detail": "Muitas tentativas. Aguarde um minuto."},
                status_code=429,
                headers={"Retry-After": "60"},
            )
        bucket.append(timestamp)
    try:
        response = await call_next(request)
    except Exception:
        # Database exceptions may contain SQL parameters with personal data.
        # Do not let the ASGI server print them in access/error logs.
        import logging

        logging.getLogger("carbons").error('{"event":"request_processing_failed"}')
        response = JSONResponse(
            {"detail": "Não foi possível concluir a solicitação. Tente novamente em instantes."},
            status_code=500,
        )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc):
    # Never echo the input (phone, password, address) in a response or log.
    errors = [{"field": ".".join(map(str, e["loc"][1:])), "message": e["msg"]} for e in exc.errors()]
    return JSONResponse({"detail": "Revise os campos do formulário.", "errors": errors}, status_code=422)


@app.get("/health")
def health(db=Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected", "demo_mode": get_settings().demo_mode}


@app.get("/api/v1/catalog")
def catalog(db=Depends(get_db)):
    expire_orders(db)
    op = get_operation_window()
    batch = get_inventory_batch(db, date.fromisoformat(op["service_date"]))
    db.commit()
    products = db.scalars(select(Product)).all()
    addons = db.scalars(select(AddOn)).all()
    return {
        "products": [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "price": p.price,
                "ingredients": p.ingredients,
                "image": p.image,
                "badge": p.badge,
                "available": p.available and batch.available > 0,
                "version": p.version,
            }
            for p in products
        ],
        "add_ons": [
            {"id": a.id, "name": a.name, "price": a.price, "available": a.available, "version": a.version}
            for a in addons
        ],
        "operation": op,
        "stock": {"available": batch.available, "capacity": batch.capacity, "low": batch.available <= 10},
    }


@app.post("/api/v1/orders", status_code=201)
def order_create(data: OrderIn, idempotency_key: str = Header(default=""), db=Depends(get_db)):
    expire_orders(db)
    order, token = create_order(db, data, idempotency_key)
    db.commit()
    return {"order": serialize_order(db, order), "token": token}


@app.get("/api/v1/orders/{token}")
def order_get(token: str, db=Depends(get_db)):
    expire_orders(db)
    db.commit()
    return serialize_order(db, find_order(db, token))


@app.post("/api/v1/orders/{token}/cancel")
def order_cancel(token: str, db=Depends(get_db)):
    order = find_order(db, token, lock=True)
    cancel_order(db, order)
    db.commit()
    return serialize_order(db, order)


@app.post("/api/v1/payments/pix")
def payment_pix(data: dict, db=Depends(get_db)):
    token = data.get("token", "")
    if not isinstance(token, str):
        fail("Token inválido.")
    order = find_order(db, token, lock=True)
    if order.payment_method != "pix" or order.status != "pending_payment":
        fail("Este pedido não tem um Pix pendente.", 409)
    if ensure_utc(order.expires_at) <= utc_now():
        fail("A reserva do Pix expirou.", 409)
    if not order.pix_id:
        try:
            integrations.create_pix(order)
        except (httpx.HTTPError, RuntimeError, KeyError):
            fail("Não foi possível gerar o Pix. Tente novamente enquanto a reserva estiver ativa.", 502)
    db.commit()
    return serialize_order(db, order)


@app.post("/api/v1/webhooks/mercado-pago")
async def mp_webhook(request: Request, db=Depends(get_db)):
    if not get_settings().pix_enabled:
        fail("Integração indisponível.", 503)
    data_id = request.query_params.get("data.id", "")
    signature = request.headers.get("x-signature", "")
    integrations.validate_mercado_pago_signature(data_id, request.headers.get("x-request-id", ""), signature)
    try:
        payment = integrations.mercado_pago_request("GET", f"/v1/payments/{int(data_id)}")
    except (ValueError, httpx.HTTPError):
        fail("Não foi possível validar o pagamento.", 502)
    order = db.scalar(select(Order).where(Order.id == payment.get("external_reference")).with_for_update())
    if not order:
        fail("Pagamento não associado a um pedido.", 404)
    event_id = f"mp:{data_id}:{payment.get('status')}:{payment.get('date_last_updated')}"
    if db.get(PaymentEvent, event_id):
        return {"received": True}
    if (
        str(payment.get("id")) != order.pix_id
        or Decimal(str(payment.get("transaction_amount", 0))) * 100 != order.total
        or payment.get("currency_id") != "BRL"
        or payment.get("payment_method_id") != "pix"
    ):
        fail("Os dados do pagamento não conferem.", 409)
    db.add(PaymentEvent(id=event_id, order_id=order.id, kind=payment.get("status", "unknown")))
    if payment.get("status") == "approved" and order.payment_status not in {
        "paid",
        "refund_pending",
        "refunded",
    }:
        if order.status in {"expired", "cancelled"} or (
            order.expires_at and ensure_utc(order.expires_at) <= utc_now()
        ):
            if order.status not in TERMINAL:
                cancel_order(db, order, by_admin=True)
            order.payment_status = "refund_pending"
            db.add(Event(dedupe_key=f"refund:{order.id}", order_id=order.id, kind="refund", payload={}))
        else:
            order.payment_status = "paid"
            order.status = "pending_approval"
            record_order_history(db, order, "pending_approval", "Pix confirmado pelo Mercado Pago")
            enqueue_order_notification(db, order, "pix_paid")
    db.commit()
    return {"received": True}


@app.get("/api/v1/webhooks/whatsapp", response_class=PlainTextResponse)
def whatsapp_verify(request: Request):
    settings = get_settings()
    token = request.query_params.get("hub.verify_token", "")
    if not settings.whatsapp_verify_token or not hmac.compare_digest(token, settings.whatsapp_verify_token):
        fail("Verificação não autorizada.", 403)
    return request.query_params.get("hub.challenge", "")


@app.post("/api/v1/webhooks/whatsapp")
async def whatsapp_webhook(request: Request, db=Depends(get_db)):
    secret = get_settings().whatsapp_app_secret
    if not secret:
        fail("Integração indisponível.", 503)
    body = await request.body()
    expected = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("x-hub-signature-256", "")):
        fail("Assinatura inválida.", 401)
    try:
        payload = json.loads(body)
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                for status in change.get("value", {}).get("statuses", []):
                    event = db.scalar(select(Event).where(Event.external_id == status.get("id")))
                    if event and status.get("status") in {"delivered", "read", "failed"}:
                        event.status = "delivered" if status["status"] in {"read", "delivered"} else "failed"
        db.commit()
    except (ValueError, TypeError, AttributeError):
        fail("Evento inválido.")
    return {"received": True}


@app.post("/api/v1/admin/auth/login")
def login(data: LoginIn, response: Response, db=Depends(get_db)):
    token = authenticate(db, data.username, data.password, data.otp)
    db.commit()
    response.set_cookie(
        "carbons_session",
        token,
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="strict",
        max_age=8 * 3600,
        path="/api/v1/admin",
    )
    return {"authenticated": True}


@app.get("/api/v1/admin/auth/me")
def me(admin=Depends(require_admin)):
    return {"username": admin.username, "mfa_enabled": True}


@app.post("/api/v1/admin/auth/logout")
def logout(request: Request, response: Response, db=Depends(get_db), admin=Depends(require_admin)):
    session = db.get(AdminSession, hash_token(request.cookies.get("carbons_session", "")))
    if session:
        db.delete(session)
    db.commit()
    response.delete_cookie("carbons_session", path="/api/v1/admin")
    return {"authenticated": False}


@app.get("/api/v1/admin/orders")
def admin_orders(
    status: str | None = None,
    service_date: date | None = None,
    page: int = 1,
    db=Depends(get_db),
    admin=Depends(require_admin),
):
    if not 1 <= page <= 1000:
        fail("Página inválida.")
    expire_orders(db)
    db.commit()
    query = select(Order)
    if status:
        query = query.where(Order.status == status)
    if service_date:
        query = query.join(Batch).where(Batch.service_date == service_date)
    orders = db.scalars(query.order_by(Order.created_at.desc()).offset((page - 1) * 50).limit(50)).all()
    return {"orders": [serialize_order(db, o, admin=True) for o in orders], "page": page}


@app.patch("/api/v1/admin/orders/{order_id}")
def admin_order_update(order_id: str, data: StatusIn, db=Depends(get_db), admin=Depends(require_admin)):
    order = db.get(Order, order_id, with_for_update=True)
    if not order:
        fail("Pedido não encontrado.", 404)
    transition_order_status(db, order, data.status, admin.id, data.estimate)
    db.commit()
    return serialize_order(db, order, admin=True)


@app.post("/api/v1/admin/orders/{order_id}/payment")
def payment_received(order_id: str, db=Depends(get_db), admin=Depends(require_admin)):
    order = db.get(Order, order_id, with_for_update=True)
    if not order:
        fail("Pedido não encontrado.", 404)
    if order.payment_method == "pix" or order.status in {"cancelled", "expired", "pending_payment"}:
        fail("Recebimento manual não permitido.", 409)
    if order.payment_status != "paid":
        order.payment_status = "paid"
        db.add(Audit(admin_id=admin.id, action="payment.received", target=order.id))
    db.commit()
    return serialize_order(db, order, admin=True)


@app.patch("/api/v1/admin/products/{product_id}")
def product_update(product_id: str, data: ProductPatch, db=Depends(get_db), admin=Depends(require_admin)):
    product = db.get(Product, product_id, with_for_update=True)
    if not product:
        fail("Lanche não encontrado.", 404)
    if data.version != product.version:
        fail("O produto foi atualizado em outra aba. Recarregue.", 409)
    for key, value in data.model_dump(exclude_unset=True, exclude={"version"}).items():
        if value is None:
            fail("O valor do campo não pode ser nulo.")
        setattr(product, key, value)
    product.version += 1
    db.add(Audit(admin_id=admin.id, action="product.updated", target=product.id))
    db.commit()
    return {"updated": True, "version": product.version}


@app.post("/api/v1/admin/orders/{order_id}/refund-confirmed")
def manual_refund_confirmed(order_id: str, db=Depends(get_db), admin=Depends(require_admin)):
    order = db.get(Order, order_id, with_for_update=True)
    if not order:
        fail("Pedido não encontrado.", 404)
    if (
        order.payment_method == "pix"
        or order.status != "cancelled"
        or order.payment_status not in {"refund_pending", "refunded"}
    ):
        fail("Devolução manual não permitida para este pedido.", 409)
    if order.payment_status != "refunded":
        order.payment_status = "refunded"
        db.add(Audit(admin_id=admin.id, action="payment.refund_confirmed", target=order.id))
    db.commit()
    return serialize_order(db, order, admin=True)


@app.get("/api/v1/admin/inventory")
def inventory(db=Depends(get_db), admin=Depends(require_admin)):
    expire_orders(db)
    get_inventory_batch(db, date.fromisoformat(get_operation_window()["service_date"]))
    db.commit()
    batches = db.scalars(select(Batch).order_by(Batch.service_date.desc()).limit(12)).all()
    return {
        "batches": [
            {
                "service_date": b.service_date.isoformat(),
                "capacity": b.capacity,
                "available": b.available,
                "reserved_or_sold": b.capacity - b.available,
                "low": b.available <= 10,
            }
            for b in batches
        ]
    }


@app.patch("/api/v1/admin/add-ons/{addon_id}")
def addon_update(addon_id: str, data: AddOnPatch, db=Depends(get_db), admin=Depends(require_admin)):
    addon = db.get(AddOn, addon_id, with_for_update=True)
    if not addon:
        fail("Adicional não encontrado.", 404)
    if addon.version != data.version:
        fail("Adicional atualizado em outra aba. Recarregue.", 409)
    addon.name, addon.price, addon.available = data.name, data.price, data.available
    addon.version += 1
    db.add(Audit(admin_id=admin.id, action="addon.updated", target=addon.id))
    db.commit()
    return {"updated": True, "version": addon.version}


@app.post("/api/v1/admin/inventory")
def stock_update(data: StockIn, db=Depends(get_db), admin=Depends(require_admin)):
    service = date.fromisoformat(data.service_date)
    if service.weekday() != 4:
        fail("O lote deve ser destinado a uma sexta-feira.")
    batch = get_inventory_batch(db, service)
    batch = db.get(Batch, batch.id, with_for_update=True, populate_existing=True)
    committed = batch.capacity - batch.available
    if data.capacity < committed:
        fail("A capacidade não pode ser menor que os hambúrgueres já reservados ou vendidos.")
    batch.available = data.capacity - committed
    batch.capacity = data.capacity
    db.add(Audit(admin_id=admin.id, action="inventory.updated", target=batch.id))
    db.commit()
    return {"updated": True}


@app.get("/api/v1/admin/reports/sales")
def reports(service_date: date | None = None, db=Depends(get_db), admin=Depends(require_admin)):
    query = select(Order)
    if service_date:
        query = query.join(Batch).where(Batch.service_date == service_date)
    orders = db.scalars(query).all()
    active = [o for o in orders if o.status not in {"cancelled", "expired"}]
    paid = [o for o in orders if o.payment_status == "paid"]
    ranking = defaultdict(lambda: {"quantity": 0, "revenue": 0})
    for order in active:
        for item in order.items:
            ranking[item["name"]]["quantity"] += item["quantity"]
            ranking[item["name"]]["revenue"] += item["quantity"] * item["unit_price"]
    return {
        "orders": len(active),
        "burgers": sum(o.quantity for o in active),
        "gross": sum(o.total for o in active),
        "received": sum(o.total for o in paid),
        "refund_pending": sum(o.total for o in orders if o.payment_status == "refund_pending"),
        "refunded": sum(o.total for o in orders if o.payment_status == "refunded"),
        "average_ticket": round(sum(o.total for o in active) / len(active)) if active else 0,
        "delivery": sum(o.fulfillment == "delivery" for o in active),
        "pickup": sum(o.fulfillment == "pickup" for o in active),
        "ranking": [
            {"name": name, **values}
            for name, values in sorted(ranking.items(), key=lambda x: -x[1]["quantity"])
        ],
        "payments": {
            method: sum(o.total for o in paid if o.payment_method == method)
            for method in ("pix", "cash", "debit", "credit")
        },
        "fees": None,
        "fees_note": "Taxas do provedor ainda não conciliadas. Valores de lucro não são calculados.",
    }


@app.get("/api/v1/admin/reports/sales.csv")
def report_csv(service_date: date | None = None, db=Depends(get_db), admin=Depends(require_admin)):
    query = select(Order)
    if service_date:
        query = query.join(Batch).where(Batch.service_date == service_date)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        [
            "pedido",
            "status",
            "pagamento",
            "situacao_pagamento",
            "lanches",
            "total_centavos",
            "entrega_centavos",
        ]
    )
    for o in db.scalars(query.order_by(Order.created_at)).all():
        writer.writerow(
            [o.code, o.status, o.payment_method, o.payment_status, o.quantity, o.total, o.delivery_fee]
        )
    return Response(
        output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="vendas-carbons.csv"'},
    )


@app.get("/api/v1/admin/audit")
def audit(db=Depends(get_db), admin=Depends(require_admin)):
    logs = db.scalars(select(Audit).order_by(Audit.created_at.desc()).limit(100)).all()
    events = db.scalars(select(Event).order_by(Event.next_attempt_at.desc()).limit(50)).all()
    return {
        "audit": [
            {"action": a.action, "target": a.target, "created_at": a.created_at.isoformat()} for a in logs
        ],
        "notifications": [
            {
                "id": e.id,
                "kind": e.kind,
                "status": e.status,
                "attempts": e.attempts,
                "last_error": e.last_error,
            }
            for e in events
        ],
    }


@app.post("/api/v1/admin/delivery-runs")
def delivery_create(data: DeliveryRunIn, db=Depends(get_db), admin=Depends(require_admin)):
    if len(data.order_ids) != len(set(data.order_ids)):
        fail("Não repita pedidos na rota.")
    orders = []
    for oid in sorted(data.order_ids):
        order = db.get(Order, oid, with_for_update=True)
        if not order or order.fulfillment != "delivery" or order.status != "ready":
            fail("Selecione somente pedidos de entrega prontos.", 409)
        orders.append(order)
    token = secrets.token_hex(32)
    run = DeliveryRun(name=data.name, token_hash=hash_token(token), expires_at=utc_now() + timedelta(hours=4))
    db.add(run)
    db.flush()
    by_id = {o.id: o for o in orders}
    for position, oid in enumerate(data.order_ids, 1):
        db.add(DeliveryStop(run_id=run.id, order_id=oid, position=position))
        transition_order_status(db, by_id[oid], "dispatched", admin.id)
    db.add(Audit(admin_id=admin.id, action="delivery.created", target=run.id))
    db.commit()
    return {"id": run.id, "token": token, "expires_at": run.expires_at.isoformat()}


@app.get("/api/v1/admin/delivery-runs")
def delivery_list(db=Depends(get_db), admin=Depends(require_admin)):
    runs = db.scalars(select(DeliveryRun).order_by(DeliveryRun.created_at.desc()).limit(30)).all()
    return {
        "runs": [
            {"id": r.id, "name": r.name, "expires_at": r.expires_at.isoformat(), "revoked": r.revoked}
            for r in runs
        ]
    }


@app.post("/api/v1/admin/delivery-runs/{run_id}/revoke")
def delivery_revoke(run_id: str, db=Depends(get_db), admin=Depends(require_admin)):
    run = db.get(DeliveryRun, run_id, with_for_update=True)
    if not run:
        fail("Rota não encontrada.", 404)
    run.revoked = True
    db.add(Audit(admin_id=admin.id, action="delivery.revoked", target=run.id))
    db.commit()
    return {"revoked": True}


def find_run(db, token, lock=False):
    query = select(DeliveryRun).where(DeliveryRun.token_hash == hash_token(token))
    run = db.scalar(query.with_for_update() if lock else query)
    if not run or run.revoked or ensure_utc(run.expires_at) < utc_now():
        fail("Link da rota inválido, revogado ou expirado.", 410)
    return run


@app.get("/api/v1/delivery/{token}")
def delivery_get(token: str, db=Depends(get_db)):
    run = find_run(db, token)
    stops = db.scalars(
        select(DeliveryStop).where(DeliveryStop.run_id == run.id).order_by(DeliveryStop.position)
    ).all()
    result = []
    for stop in stops:
        order = db.get(Order, stop.order_id)
        result.append(
            {
                "id": stop.id,
                "position": stop.position,
                "status": stop.status,
                "order_code": order.code,
                "customer_name": order.customer_name,
                "address": order.address,
                "phone": order.phone,
                "total": order.total,
                "payment_status": order.payment_status,
                "payment_method": order.payment_method,
                "change_for": order.change_for,
            }
        )
    return {"name": run.name, "expires_at": run.expires_at.isoformat(), "stops": result}


@app.post("/api/v1/delivery/{token}/stops/{stop_id}")
def delivery_stop(token: str, stop_id: str, data: StopIn, db=Depends(get_db)):
    run = find_run(db, token, lock=True)
    stop = db.scalar(
        select(DeliveryStop)
        .where(DeliveryStop.id == stop_id, DeliveryStop.run_id == run.id)
        .with_for_update()
    )
    if not stop:
        fail("Parada não encontrada.", 404)
    if stop.status == "delivered":
        return {"updated": True}
    order = db.get(Order, stop.order_id, with_for_update=True)
    if order.status != "dispatched":
        fail("Este pedido não está em entrega.", 409)
    if data.status == "delivered":
        if order.payment_method == "pix" and order.payment_status != "paid":
            fail("O Pix não foi confirmado.", 409)
        if order.payment_status != "paid":
            order.payment_status = "paid"
        order.status = "completed"
        record_order_history(db, order, "completed", "Entrega e recebimento confirmados pelo entregador")
    stop.status = data.status
    db.add(Audit(action=f"delivery.{data.status}", target=order.id))
    db.commit()
    return {"updated": True}
