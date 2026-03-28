"""Authentication helpers for JWT and role-based access."""

from datetime import datetime, timedelta, timezone
import os
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "120"))

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def _validate_bcrypt_input(password: str) -> None:
    if len(password.encode("utf-8")) > 72:
        raise HTTPException(
            status_code=400,
            detail="La contraseña es demasiado larga para bcrypt (máximo 72 bytes).",
        )


def hash_password(password: str) -> str:
    _validate_bcrypt_input(password)
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    _validate_bcrypt_input(plain_password)
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(subject: str, role: str, tenant: str) -> str:
    """El token ahora incluye el tenant para que cada request lo conozca."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {"sub": subject, "role": role, "tenant": tenant, "exp": expire}
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def authenticate_user(db: Session, identifier: str, password: str, tenant: str) -> User | None:
    """Busca el usuario SOLO dentro del tenant indicado."""
    user = db.query(User).filter(
        or_(User.email == identifier, User.telefono == identifier),
        User.tenant == tenant,
    ).first()
    if not user or not verify_password(password, user.password_hash):
        return None
    return user


def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("sub")
        tenant = payload.get("tenant")
        if user_id is None or tenant is None:
            raise credentials_exception
    except JWTError as exc:
        raise credentials_exception from exc

    user = db.query(User).filter(User.id == user_id, User.tenant == tenant).first()
    if user is None:
        raise credentials_exception
    return user


def require_admin(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    if current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Acceso solo para administradores.")
    return current_user
