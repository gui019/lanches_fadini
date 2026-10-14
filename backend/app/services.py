import hashlib
import hmac
import json
import secrets
import unicodedata
from datetime import UTC, date, time, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert

from .config import get_settings
from .models import AddOn, Audit, Batch, Event, History, Order, Product, utc_now

TZ = ZoneInfo("America/Sao_Paulo")
LABELS = {
    "pending_payment": "Aguardando pagamento",
    "pending_approval": "Aguardando aprovação",
    "confirmed": "Pedido confirmado",
    "preparing": "Em preparo",
    "ready": "Pedido pronto",
    "dispatched": "Saiu para entrega",
    "completed": "Concluído",
    "cancelled": "Cancelado",
    "expired": "Expirado",
}
TERMINAL = {"cancelled", "expired", "completed"}
TRANSITIONS = {
    "pending_payment": set(),
    "pending_approval": {"confirmed", "cancelled"},
    "confirmed": {"preparing", "cancelled"},
    "preparing": {"ready", "cancelled"},
    "ready": {"dispatched", "completed", "cancelled"},
    "dispatched": {"completed", "cancelled"},
}


def fail(message, status=400):
    raise HTTPException(status, detail=message)


def hash_token(value):
    return hashlib.sha256(value.encode()).hexdigest()


def generate_tracking_token(order):
    return hmac.new(
        get_settings().token_secret.encode(), f"{order.id}:{order.idempotency_key}".encode(), hashlib.sha256
    ).hexdigest()


def ensure_utc(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def get_operation_window(at=None):
    settings = get_settings()
    local = (at or utc_now()).astimezone(TZ)
    weekday = local.weekday()
    service = local.date() + timedelta(days=(4 - weekday) % 7)
    opened = (
        (weekday == 0 and local.time() >= time(15))
        or weekday in (1, 2, 3)
        or (weekday == 4 and time(18) <= local.time() < time(21, 30))
    )
    message = "Agende seu pedido para sexta-feira" if weekday < 4 else "Pedidos para esta sexta-feira"
    if not opened:
        message = (
            "Pedidos de hoje abrem às 18h"
            if weekday == 4 and local.time() < time(18)
            else "Agendamentos abrem segunda-feira, às 15h"
        )
    if weekday == 4 and local.time() >= time(21, 30):
        service += timedelta(days=7)
    return {
        "open": opened or settings.demo_mode,
        "real_open": opened,
        "demo_mode": settings.demo_mode,
        "message": message,
        "service_date": service.isoformat(),
        "timezone": "America/Sao_Paulo",
        "delivery_fee": 600,
        "pix_enabled": settings.pix_enabled,
        "whatsapp_enabled": settings.whatsapp_enabled,
        "delivery_available": bool(settings.delivery_allowed_ceps) or settings.demo_mode,
        "pickup_available": bool(settings.pickup_address) or settings.demo_mode,
    }


def get_inventory_batch(db, service_date):
    # INSERT ON CONFLICT avoids a race when the first clients open a new week.
    db.execute(
        insert(Batch)
        .values(service_date=service_date, capacity=40, available=40)
        .on_conflict_do_nothing(index_elements=[Batch.service_date])
    )
    db.flush()
    return db.scalar(select(Batch).where(Batch.service_date == service_date))


def record_order_history(db, order, status, message=None):
    db.add(History(order_id=order.id, status=status, message=message or LABELS.get(status, status)))


def enqueue_order_notification(db, order, suffix=None):
    if order.whatsapp_consent:
        db.add(
            Event(
                dedupe_key=f"whatsapp:{order.id}:{suffix or order.status}",
                order_id=order.id,
                kind="whatsapp",
                payload={"status": order.status, "estimate": order.estimate},
            )
        )


def release_stock(db, order):
    if not order.stock_released:
        db.execute(
            update(Batch)
            .where(Batch.id == order.batch_id)
            .values(available=Batch.available + order.stock_units)
        )
        order.stock_released = True


def expire_orders(db):
    orders = db.scalars(
        select(Order)
        .where(Order.status == "pending_payment", Order.expires_at <= utc_now())
        .with_for_update(skip_locked=True)
    ).all()
    for order in orders:
        order.status = "expired"
        order.payment_status = "expired"
        release_stock(db, order)
        record_order_history(db, order, "expired")
        enqueue_order_notification(db, order)
    return len(orders)


def validate_address(data):
    if data.fulfillment == "pickup":
        if not get_settings().pickup_address and not get_settings().demo_mode:
            fail("Retirada indisponível até a equipe configurar o endereço.")
        return None
    address = data.address
    if not address:
        fail("Informe o endereço de entrega.")
    city = (
        "".join(c for c in unicodedata.normalize("NFKD", address.city) if not unicodedata.combining(c))
        .casefold()
        .strip()
    )
    if city != "pirassununga" or address.area != "urban":
        fail("Entregamos somente na área urbana de Pirassununga.")
    cep = address.cep.replace("-", "")
    allowed = {
        c.strip().replace("-", "") for c in get_settings().delivery_allowed_ceps.split(",") if c.strip()
    }
    if get_settings().demo_mode:
        allowed.add("13630000")
    if cep not in allowed:
        fail("CEP fora da área de entrega cadastrada. Entre em contato com a equipe ou escolha retirada.")
    return address.model_dump()


def create_order(db, data, key):
    if not key or not 16 <= len(key) <= 80:
        fail("Envie uma chave de idempotência válida.")
    fingerprint = hash_token(json.dumps(data.model_dump(), sort_keys=True, ensure_ascii=False))
    # Serialize identical requests across API workers, including lost-response retries.
    db.execute(select(func.pg_advisory_xact_lock(int(hash_token(key)[:15], 16))))
    previous = db.scalar(select(Order).where(Order.idempotency_key == key))
    if previous:
        if previous.request_hash != fingerprint:
            fail("Esta chave já foi utilizada para outro pedido.", 409)
        return previous, generate_tracking_token(previous)
    op = get_operation_window()
    if not op["open"]:
        fail(op["message"], 409)
    if data.service_date != op["service_date"]:
        fail("A data de atendimento mudou. Atualize o cardápio.", 409)
    quantity = sum(item.quantity for item in data.items)
    if not 1 <= quantity <= 10:
        fail("Seu pedido precisa ter entre um e dez lanches.")
    if data.payment_method == "pix" and not get_settings().pix_enabled:
        fail("Pix ainda não está habilitado. Escolha dinheiro ou cartão presencial.", 503)
    if data.payment_method == "pix" and not data.email:
        fail("Informe o e-mail para a cobrança Pix.")
    address = validate_address(data)
    # Acquire every catalog lock in the same order to prevent multi-product deadlocks.
    db.scalars(
        select(Product)
        .where(Product.id.in_(sorted({i.product_id for i in data.items})))
        .order_by(Product.id)
        .with_for_update()
    ).all()
    addon_ids = sorted({key for item in data.items for key in item.additions})
    if addon_ids:
        db.scalars(select(AddOn).where(AddOn.id.in_(addon_ids)).order_by(AddOn.id).with_for_update()).all()
    snapshots, subtotal, stock_units = [], 0, 0
    for item in data.items:
        product = db.get(Product, item.product_id, with_for_update=True)
        if not product or not product.available:
            fail("Um dos lanches está indisponível. Revise o carrinho.", 409)
        if product.version != item.version:
            fail(f"{product.name} foi atualizado. Atualize o carrinho antes de continuar.", 409)
        if any(name not in product.ingredients for name in item.removed):
            fail("Ingrediente inválido para remoção.")
        additions, unit_price = [], product.price
        for addon_id, count in sorted(item.additions.items()):
            addon = db.get(AddOn, addon_id, with_for_update=True)
            if not addon or not addon.available:
                fail("Adicional indisponível.", 409)
            if item.addition_versions.get(addon_id) != addon.version:
                fail("O preço de um adicional mudou. Atualize o carrinho.", 409)
            unit_price += addon.price * count
            additions.append({"id": addon.id, "name": addon.name, "quantity": count, "price": addon.price})
        subtotal += unit_price * item.quantity
        stock_units += (1 + item.additions.get("hamburguer", 0)) * item.quantity
        snapshots.append(
            {
                "product_id": product.id,
                "name": product.name,
                "image": product.image,
                "base_price": product.price,
                "unit_price": unit_price,
                "quantity": item.quantity,
                "removed": list(dict.fromkeys(item.removed)),
                "additions": additions,
            }
        )
    fee = 600 if data.fulfillment == "delivery" else 0
    total = subtotal + fee
    if total != data.expected_total:
        fail("O valor do carrinho mudou. Revise os valores antes de finalizar.", 409)
    if data.payment_method == "cash" and data.change_for and data.change_for < total:
        fail("O valor para troco deve ser igual ou maior que o total.")
    batch = get_inventory_batch(db, date.fromisoformat(data.service_date))
    reserved = db.execute(
        update(Batch)
        .where(Batch.id == batch.id, Batch.available >= stock_units)
        .values(available=Batch.available - stock_units)
        .returning(Batch.id)
    ).first()
    if not reserved:
        fail("Não há hambúrgueres suficientes no lote desta semana. Reduza o pedido.", 409)
    order = Order(
        code=f"CB-{secrets.token_hex(3).upper()}",
        token_hash="temporary-" + secrets.token_hex(16),
        idempotency_key=key,
        request_hash=fingerprint,
        batch_id=batch.id,
        customer_name=data.customer_name,
        phone=data.phone,
        email=data.email if data.payment_method == "pix" else None,
        fulfillment=data.fulfillment,
        address=address,
        payment_method=data.payment_method,
        status="pending_payment" if data.payment_method == "pix" else "pending_approval",
        items=snapshots,
        quantity=quantity,
        stock_units=stock_units,
        subtotal=subtotal,
        delivery_fee=fee,
        total=total,
        change_for=data.change_for if data.payment_method == "cash" else None,
        slot=data.slot,
        whatsapp_consent=data.whatsapp_consent,
        expires_at=utc_now() + timedelta(minutes=30) if data.payment_method == "pix" else None,
    )
    db.add(order)
    db.flush()
    token = generate_tracking_token(order)
    order.token_hash = hash_token(token)
    record_order_history(db, order, order.status)
    return order, token


def find_order(db, token, lock=False):
    if len(token) != 64:
        fail("Link de acompanhamento inválido.", 404)
    query = select(Order).where(Order.token_hash == hash_token(token))
    order = db.scalar(query.with_for_update() if lock else query)
    if not order:
        fail("Pedido não encontrado ou link expirado.", 404)
    batch = db.get(Batch, order.batch_id)
    if utc_now().date() > batch.service_date + timedelta(days=7):
        fail("Este link de acompanhamento expirou.", 410)
    return order


def serialize_order(db, order, admin=False):
    batch = db.get(Batch, order.batch_id)
    events = db.scalars(
        select(History).where(History.order_id == order.id).order_by(History.created_at, History.id)
    ).all()
    result = {
        "code": order.code,
        "customer_name": order.customer_name.split()[0] if not admin else order.customer_name,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "fulfillment": order.fulfillment,
        "items": order.items,
        "quantity": order.quantity,
        "subtotal": order.subtotal,
        "delivery_fee": order.delivery_fee,
        "total": order.total,
        "slot": order.slot,
        "service_date": batch.service_date.isoformat(),
        "estimate": order.estimate,
        "cancel_requested": order.cancel_requested,
        "created_at": order.created_at.isoformat(),
        "expires_at": order.expires_at.isoformat() if order.expires_at else None,
        "history": [
            {"status": h.status, "message": h.message, "created_at": h.created_at.isoformat()} for h in events
        ],
        "demo_mode": get_settings().demo_mode,
    }
    if order.fulfillment == "pickup" and order.status in {"confirmed", "preparing", "ready", "completed"}:
        result["pickup_address"] = (
            get_settings().pickup_address
            or "Ponto de retirada demonstrativo — confirme o local com a equipe."
        )
    if order.pix_data and order.status == "pending_payment":
        result["pix"] = order.pix_data
    if admin:
        result.update(
            id=order.id,
            phone=order.phone,
            address=order.address,
            change_for=order.change_for,
            stock_units=order.stock_units,
        )
    return result


def cancel_order(db, order, by_admin=False):
    if order.status in TERMINAL:
        return
    if order.status in {"preparing", "ready", "dispatched"} and not by_admin:
        if not order.cancel_requested:
            order.cancel_requested = True
            record_order_history(
                db, order, "cancel_requested", "Solicitação de cancelamento enviada à equipe"
            )
        return
    # Started food has already consumed its ingredients and cannot be resold.
    if order.status in {"pending_payment", "pending_approval", "confirmed"}:
        release_stock(db, order)
    order.status = "cancelled"
    if order.payment_status == "paid":
        order.payment_status = "refund_pending"
        if order.payment_method == "pix":
            db.add(Event(dedupe_key=f"refund:{order.id}", order_id=order.id, kind="refund", payload={}))
    record_order_history(db, order, "cancelled")
    enqueue_order_notification(db, order)


def transition_order_status(db, order, target, admin_id, estimate=None):
    if target not in TRANSITIONS.get(order.status, set()):
        fail("Esta mudança de status não é permitida.", 409)
    if target == "confirmed":
        if not estimate:
            fail("Informe a previsão de atendimento antes de confirmar.")
        if order.payment_method == "pix" and order.payment_status != "paid":
            fail("O Pix precisa ser confirmado pelo provedor.", 409)
        order.estimate = estimate
    if target == "dispatched" and order.fulfillment != "delivery":
        fail("Pedido de retirada não pode sair para entrega.")
    if target == "completed":
        if order.fulfillment == "delivery" and order.status != "dispatched":
            fail("Despache o pedido antes de concluir a entrega.")
        if order.payment_status != "paid":
            fail("Confirme o recebimento do pagamento antes de concluir.")
    if target == "cancelled":
        cancel_order(db, order, by_admin=True)
    else:
        order.status = target
        record_order_history(db, order, target)
        enqueue_order_notification(db, order)
    db.add(Audit(admin_id=admin_id, action=f"order.{target}", target=order.id))
