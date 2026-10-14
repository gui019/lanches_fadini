import secrets
from datetime import timedelta

import pyotp
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Depends, Request
from sqlalchemy import select

from .db import get_db
from .models import Admin, AdminSession, Audit, utc_now
from .services import hash_token, fail

password_hasher = PasswordHasher()
# A dummy hash keeps nonexistent-user authentication close to the same code path.
DUMMY_HASH = password_hasher.hash(secrets.token_urlsafe(32))


def authenticate(db, username, password, otp):
    admin = db.scalar(select(Admin).where(Admin.username == username))
    try:
        password_hasher.verify(admin.password_hash if admin else DUMMY_HASH, password)
    except (VerificationError, InvalidHashError):
        fail("Usuário, senha ou código de autenticação inválido.", 401)
    if not admin or not pyotp.TOTP(admin.totp_secret).verify(otp, valid_window=1):
        fail("Usuário, senha ou código de autenticação inválido.", 401)
    token = secrets.token_urlsafe(48)
    db.add(
        AdminSession(
            token_hash=hash_token(token), admin_id=admin.id, expires_at=utc_now() + timedelta(hours=8)
        )
    )
    db.add(Audit(admin_id=admin.id, action="auth.login", target="admin"))
    return token


def require_admin(request: Request, db=Depends(get_db)):
    token = request.cookies.get("carbons_session", "")
    session = db.scalar(
        select(AdminSession).where(
            AdminSession.token_hash == hash_token(token), AdminSession.expires_at > utc_now()
        )
    )
    if not session:
        fail("Entre no painel para continuar.", 401)
    return db.get(Admin, session.admin_id)
