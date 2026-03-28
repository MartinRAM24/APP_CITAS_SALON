"""SQLAlchemy models — multi-tenant (salon + podologo)."""

import uuid
from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

# Valores válidos de tenant — agregar aquí si se suma un 3er negocio
TENANTS = ("salon", "podologo")


class User(Base):
    __tablename__ = "usuarios"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    nombre: Mapped[str] = mapped_column(String(150), nullable=False)
    telefono: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    rol: Mapped[str] = mapped_column(Enum("cliente", "admin", name="rol_usuario"), default="cliente", nullable=False)
    # Negocio al que pertenece este usuario
    tenant: Mapped[str] = mapped_column(
        Enum(*TENANTS, name="tenant_enum"), nullable=False, default="salon", index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    citas: Mapped[list["Appointment"]] = relationship(back_populates="usuario")

    # email único POR tenant (mismo email puede usarse en ambos negocios)
    __table_args__ = (
        __import__("sqlalchemy").UniqueConstraint("email", "tenant", name="uq_usuario_email_tenant"),
        __import__("sqlalchemy").UniqueConstraint("telefono", "tenant", name="uq_usuario_telefono_tenant"),
    )


class Service(Base):
    __tablename__ = "servicios"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    nombre: Mapped[str] = mapped_column(String(120), nullable=False)
    duracion_minutos: Mapped[int] = mapped_column(Integer, nullable=False)
    precio: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    # Servicio pertenece a un negocio
    tenant: Mapped[str] = mapped_column(
        Enum(*TENANTS, name="tenant_enum"), nullable=False, default="salon", index=True
    )

    citas: Mapped[list["Appointment"]] = relationship(back_populates="servicio")


class Appointment(Base):
    __tablename__ = "citas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    usuario_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("usuarios.id"), nullable=False)
    servicio_id: Mapped[int] = mapped_column(Integer, ForeignKey("servicios.id"), nullable=False)
    tenant: Mapped[str] = mapped_column(
        Enum(*TENANTS, name="tenant_enum"), nullable=False, default="salon", index=True
    )
    fecha: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    hora: Mapped[time] = mapped_column(Time, nullable=False, index=True)
    estado: Mapped[str] = mapped_column(
        Enum("agendada", "cancelada", "completada", name="estado_cita"), default="agendada", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    usuario: Mapped["User"] = relationship(back_populates="citas")
    servicio: Mapped["Service"] = relationship(back_populates="citas")
