import argparse
import getpass
import os
from datetime import timedelta
from pathlib import Path

import pyotp
from sqlalchemy import delete, select

from .db import SessionLocal
from .models import Admin, AdminSession, Order, now
from .security import password_hasher
from .seed import seed


def main():
    parser = argparse.ArgumentParser(description="Operação local da Carbon's Burguer")
    parser.add_argument("command", choices=["seed", "create-admin", "anonymize"])
    parser.add_argument("--username", default="admin")
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.command == "seed":
            seed(db)
            print("Cardápio inicializado; dados existentes preservados.")
        elif args.command == "create-admin":
            if db.scalar(select(Admin).where(Admin.username == args.username)):
                raise SystemExit("Administrador já existe. Não foi alterado.")
            password = getpass.getpass("Senha (mínimo de 12 caracteres): ")
            if len(password) < 12 or password != getpass.getpass("Repita a senha: "):
                raise SystemExit("Senha curta ou confirmação diferente.")
            secret = pyotp.random_base32()
            # A local file avoids placing the TOTP secret in stdout or shell history.
            path = Path(".private")
            path.mkdir(mode=0o700, exist_ok=True)
            target = path / f"mfa-{__import__('secrets').token_hex(4)}.txt"
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as file:
                file.write(pyotp.TOTP(secret).provisioning_uri(args.username, issuer_name="Carbon's Burguer"))
            print(
                f"Abra {target} localmente para cadastrar a chave em seu autenticador. Não compartilhe o arquivo."
            )
            otp = input("Código de 6 dígitos do autenticador: ").strip()
            if not pyotp.TOTP(secret).verify(otp, valid_window=1):
                target.unlink()
                raise SystemExit("Código inválido. Administrador não foi criado.")
            db.add(
                Admin(
                    username=args.username, password_hash=password_hasher.hash(password), totp_secret=secret
                )
            )
            db.commit()
            target.unlink()
            print("Administrador criado com MFA. Arquivo de configuração removido.")
        else:
            from .config import get_settings

            cutoff = now() - timedelta(days=get_settings().data_retention_days)
            orders = db.scalars(
                select(Order).where(
                    Order.created_at < cutoff, Order.status.in_(["completed", "cancelled", "expired"])
                )
            ).all()
            for order in orders:
                order.customer_name = "Cliente anonimizado"
                order.phone = ""
                order.email = None
                order.address = None
                order.pix_data = None
            db.execute(delete(AdminSession).where(AdminSession.expires_at < now()))
            db.commit()
            print(f"{len(orders)} pedidos anonimizados. Confirme a retenção aplicável com o responsável.")


if __name__ == "__main__":
    main()
