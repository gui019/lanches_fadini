import argparse
import getpass
import os
from datetime import timedelta
from pathlib import Path

import pyotp
from sqlalchemy import delete, select

from .db import SessionLocal
from .models import Admin, AdminSession, Order, utc_now
from .security import password_hasher
from .seed import seed


def main():
    parser = argparse.ArgumentParser(description="Carbon's Burguer management commands")
    parser.add_argument("command", choices=["seed", "create-admin", "anonymize"])
    parser.add_argument("--username", default="admin")
    args = parser.parse_args()
    with SessionLocal() as db:
        if args.command == "seed":
            seed(db)
            print("Catalog initialized; existing data preserved.")
        elif args.command == "create-admin":
            if db.scalar(select(Admin).where(Admin.username == args.username)):
                raise SystemExit("Administrator already exists; no changes were made.")
            password = getpass.getpass("Password (at least 12 characters): ")
            if len(password) < 12 or password != getpass.getpass("Confirm password: "):
                raise SystemExit("Password is too short or confirmation does not match.")
            secret = pyotp.random_base32()
            # A local file avoids placing the TOTP secret in stdout or shell history.
            path = Path(".private")
            path.mkdir(mode=0o700, exist_ok=True)
            target = path / f"mfa-{__import__('secrets').token_hex(4)}.txt"
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as file:
                file.write(pyotp.TOTP(secret).provisioning_uri(args.username, issuer_name="Carbon's Burguer"))
            print(f"Open {target} locally to enroll your authenticator. Do not share this file.")
            otp = input("Six-digit authenticator code: ").strip()
            if not pyotp.TOTP(secret).verify(otp, valid_window=1):
                target.unlink()
                raise SystemExit("Invalid code; administrator was not created.")
            db.add(
                Admin(
                    username=args.username, password_hash=password_hasher.hash(password), totp_secret=secret
                )
            )
            db.commit()
            target.unlink()
            print("Administrator created with MFA; temporary enrollment file removed.")
        else:
            from .config import get_settings

            cutoff = utc_now() - timedelta(days=get_settings().data_retention_days)
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
            db.execute(delete(AdminSession).where(AdminSession.expires_at < utc_now()))
            db.commit()
            print(f"{len(orders)} orders anonymized. Confirm the applicable retention policy with the owner.")


if __name__ == "__main__":
    main()
