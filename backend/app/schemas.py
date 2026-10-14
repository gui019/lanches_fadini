import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class ItemIn(StrictModel):
    product_id: str = Field(min_length=1, max_length=50)
    version: int = Field(ge=1)
    quantity: int = Field(ge=1, le=10, strict=True)
    removed: list[str] = Field(default_factory=list, max_length=20)
    additions: dict[str, StrictInt] = Field(default_factory=dict, max_length=15)
    addition_versions: dict[str, StrictInt] = Field(default_factory=dict, max_length=15)

    @field_validator("additions")
    @classmethod
    def validate_addition_quantities(cls, value):
        if any(type(v) is not int or not 1 <= v <= 5 for v in value.values()):
            raise ValueError("Cada adicional permite de uma a cinco unidades por lanche.")
        return value


class AddressIn(StrictModel):
    street: str = Field(min_length=3, max_length=120)
    number: str = Field(min_length=1, max_length=15)
    neighborhood: str = Field(min_length=2, max_length=80)
    city: str = Field(min_length=3, max_length=60)
    cep: str = Field(pattern=r"^\d{5}-?\d{3}$")
    complement: str = Field(default="", max_length=120)
    area: Literal["urban", "rural"]


class OrderIn(StrictModel):
    customer_name: str = Field(min_length=2, max_length=100)
    phone: str
    email: str | None = Field(default=None, max_length=254)
    fulfillment: Literal["delivery", "pickup"]
    address: AddressIn | None = None
    payment_method: Literal["pix", "cash", "debit", "credit"]
    change_for: int | None = Field(default=None, ge=0, le=100000, strict=True)
    service_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    slot: Literal["20:00", "20:30", "21:00", "21:30"]
    items: list[ItemIn] = Field(min_length=1, max_length=10)
    whatsapp_consent: bool = False
    terms_accepted: Literal[True]
    expected_total: int = Field(ge=0, strict=True)

    @field_validator("service_date")
    @classmethod
    def validate_service_date(cls, value):
        date.fromisoformat(value)
        return value

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value):
        value = re.sub(r"\D", "", value)
        if value.startswith("55") and len(value) == 13:
            value = value[2:]
        if not re.fullmatch(r"[1-9]\d9\d{8}", value):
            raise ValueError("Informe um celular com DDD e 11 dígitos.")
        return value

    @field_validator("email")
    @classmethod
    def validate_email(cls, value):
        if value and not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
            raise ValueError("E-mail inválido.")
        return value


class LoginIn(StrictModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=256)
    otp: str = Field(pattern=r"^\d{6}$")


class StatusIn(StrictModel):
    status: str = Field(max_length=40)
    estimate: str | None = Field(default=None, max_length=100)


class ProductPatch(StrictModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    description: str | None = Field(default=None, min_length=5, max_length=500)
    price: int | None = Field(default=None, ge=1, le=100000, strict=True)
    available: bool | None = None
    ingredients: list[str] | None = Field(default=None, min_length=1, max_length=20)
    version: int = Field(ge=1)


class StockIn(StrictModel):
    service_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    capacity: int = Field(ge=1, le=1000, strict=True)

    @field_validator("service_date")
    @classmethod
    def validate_service_date(cls, value):
        date.fromisoformat(value)
        return value


class AddOnPatch(StrictModel):
    name: str = Field(min_length=2, max_length=100)
    price: int = Field(ge=1, le=100000, strict=True)
    available: bool
    version: int = Field(ge=1)


class DeliveryRunIn(StrictModel):
    name: str = Field(min_length=2, max_length=100)
    order_ids: list[str] = Field(min_length=1, max_length=20)


class StopIn(StrictModel):
    status: Literal["delivered", "not_found", "payment_issue"]
