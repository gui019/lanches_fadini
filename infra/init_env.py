"""Creates local-only random credentials without overwriting an existing environment."""

import os
import secrets
from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / ".env"
if not path.exists():
    password = secrets.token_urlsafe(32)
    data = "\n".join(
        [
            "APP_ENV=development",
            "DEMO_MODE=true",
            "COOKIE_SECURE=false",
            "PUBLIC_URL=http://localhost:3000",
            "API_INTERNAL_URL=http://127.0.0.1:8000",
            f"POSTGRES_PASSWORD={password}",
            f"DATABASE_URL=postgresql+psycopg://carbons:{password}@127.0.0.1:5432/carbons",
            f"TOKEN_SECRET={secrets.token_urlsafe(48)}",
            "PICKUP_ADDRESS=",
            "DELIVERY_ALLOWED_CEPS=",
            "",
        ]
    )
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as file:
        file.write(data)
    print("Configuração local criada em .env (ignorada pelo Git).")
else:
    print("Configuração .env existente preservada.")
