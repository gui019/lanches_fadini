from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file="../.env", extra="ignore")
    app_env: str = "development"
    database_url: str = "postgresql+psycopg://carbons:carbons@127.0.0.1:5432/carbons"
    public_url: str = "http://localhost:3000"
    demo_mode: bool = True
    cookie_secure: bool = False
    pickup_address: str = ""
    delivery_allowed_ceps: str = ""
    mercado_pago_access_token: str = ""
    mercado_pago_webhook_secret: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_app_secret: str = ""
    whatsapp_verify_token: str = ""
    whatsapp_template: str = ""
    data_retention_days: int = 90
    token_secret: str = ""

    @property
    def pix_enabled(self):
        return bool(
            self.mercado_pago_access_token and self.mercado_pago_webhook_secret and not self.demo_mode
        )

    @property
    def whatsapp_enabled(self):
        return bool(self.whatsapp_access_token and self.whatsapp_phone_number_id and self.whatsapp_template)

    def validate_production(self):
        if len(self.token_secret) < 32:
            raise RuntimeError(
                "Configure TOKEN_SECRET com ao menos 32 caracteres; use infra/init_env.py no desenvolvimento."
            )
        if self.app_env == "production":
            if self.demo_mode or not self.cookie_secure or not self.public_url.startswith("https://"):
                raise RuntimeError("Produção exige DEMO_MODE=false, COOKIE_SECURE=true e PUBLIC_URL HTTPS.")
            if not self.database_url.startswith("postgresql"):
                raise RuntimeError("Produção exige PostgreSQL.")


@lru_cache
def get_settings():
    return Settings()
