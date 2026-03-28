"""Admin routes — multi-tenant."""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.database import get_db
from app.models import Appointment, Service, User
from app.schemas import (
    AdminClientMatch,
    AppointmentAdminCreate,
    AppointmentOut,
    AppointmentUpdate,
    ServiceCreate,
    ServiceOut,
    ServiceUpdate,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def validate_appointment_slot(db: Session, fecha: date, hora, tenant: str, exclude_id: int | None = None):
    if fecha <= date.today():
        raise HTTPException(status_code=400, detail="Las citas deben programarse a partir de mañana.")
    query = db.query(Appointment).filter(
        Appointment.fecha == fecha,
        Appointment.hora == hora,
        Appointment.estado == "agendada",
        Appointment.tenant == tenant,
    )
    if exclude_id:
        query = query.filter(Appointment.id != exclude_id)
    if query.first():
        raise HTTPException(status_code=400, detail="Horario ocupado. Elige otra hora.")


@router.get("/clientes", response_model=list[AdminClientMatch])
def search_clients(
    query: str = "",
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    # Solo clientes del mismo tenant que el admin
    base_query = db.query(User).filter(User.rol == "cliente", User.tenant == admin.tenant)
    if query.strip():
        like = f"%{query.strip()}%"
        base_query = base_query.filter(
            or_(User.nombre.ilike(like), User.email.ilike(like), User.telefono.ilike(like))
        )
    return base_query.order_by(User.nombre.asc()).limit(20).all()


@router.get("/citas", response_model=list[AppointmentOut])
def list_all_appointments(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    appointments = (
        db.query(Appointment)
        .join(Service)
        .join(User)
        .filter(Appointment.estado != "cancelada", Appointment.tenant == admin.tenant)
        .order_by(Appointment.fecha.asc(), Appointment.hora.asc())
        .all()
    )
    return [
        AppointmentOut(
            id=item.id,
            usuario_id=item.usuario_id,
            usuario_nombre=item.usuario.nombre,
            servicio_id=item.servicio_id,
            servicio_nombre=item.servicio.nombre,
            fecha=item.fecha,
            hora=item.hora,
            estado=item.estado,
            created_at=item.created_at,
        )
        for item in appointments
    ]


@router.post("/citas", response_model=AppointmentOut)
def create_manual_appointment(
    payload: AppointmentAdminCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    tenant = admin.tenant

    user = None
    if payload.usuario_id:
        user = db.query(User).filter(User.id == payload.usuario_id, User.rol == "cliente", User.tenant == tenant).first()
    elif payload.cliente_nombre:
        matches = (
            db.query(User)
            .filter(User.rol == "cliente", User.tenant == tenant, User.nombre.ilike(payload.cliente_nombre.strip()))
            .order_by(User.created_at.asc())
            .all()
        )
        if len(matches) == 1:
            user = matches[0]
        elif len(matches) > 1:
            raise HTTPException(status_code=400, detail="Hay varios clientes con ese nombre. Selecciona uno de la lista.")
        else:
            raise HTTPException(status_code=404, detail="No existe un cliente registrado con ese nombre en este negocio.")

    if not user:
        raise HTTPException(status_code=400, detail="Debes seleccionar un cliente válido.")

    service = db.query(Service).filter(Service.id == payload.servicio_id, Service.tenant == tenant).first()
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado.")

    validate_appointment_slot(db, payload.fecha, payload.hora, tenant)

    appointment = Appointment(
        usuario_id=user.id,
        servicio_id=payload.servicio_id,
        fecha=payload.fecha,
        hora=payload.hora,
        estado="agendada",
        tenant=tenant,
    )
    db.add(appointment)
    db.commit()
    db.refresh(appointment)

    return AppointmentOut(
        id=appointment.id,
        usuario_id=appointment.usuario_id,
        usuario_nombre=user.nombre,
        servicio_id=appointment.servicio_id,
        servicio_nombre=appointment.servicio.nombre,
        fecha=appointment.fecha,
        hora=appointment.hora,
        estado=appointment.estado,
        created_at=appointment.created_at,
    )


@router.patch("/citas/{appointment_id}", response_model=AppointmentOut)
def update_appointment(
    appointment_id: int,
    payload: AppointmentUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    appointment = db.query(Appointment).filter(
        Appointment.id == appointment_id, Appointment.tenant == admin.tenant
    ).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada.")

    if payload.servicio_id is not None:
        service = db.query(Service).filter(Service.id == payload.servicio_id, Service.tenant == admin.tenant).first()
        if not service:
            raise HTTPException(status_code=404, detail="Servicio no encontrado.")
        appointment.servicio_id = payload.servicio_id

    new_date = payload.fecha or appointment.fecha
    new_time = payload.hora or appointment.hora
    if payload.fecha is not None or payload.hora is not None:
        validate_appointment_slot(db, new_date, new_time, admin.tenant, exclude_id=appointment.id)
        appointment.fecha = new_date
        appointment.hora = new_time

    if payload.estado is not None:
        appointment.estado = payload.estado

    db.commit()
    db.refresh(appointment)

    return AppointmentOut(
        id=appointment.id,
        usuario_id=appointment.usuario_id,
        usuario_nombre=appointment.usuario.nombre,
        servicio_id=appointment.servicio_id,
        servicio_nombre=appointment.servicio.nombre,
        fecha=appointment.fecha,
        hora=appointment.hora,
        estado=appointment.estado,
        created_at=appointment.created_at,
    )


@router.delete("/citas/{appointment_id}")
def cancel_appointment(appointment_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    appointment = db.query(Appointment).filter(
        Appointment.id == appointment_id, Appointment.tenant == admin.tenant
    ).first()
    if not appointment:
        raise HTTPException(status_code=404, detail="Cita no encontrada.")
    appointment.estado = "cancelada"
    db.commit()
    return {"message": "Cita cancelada."}


@router.post("/servicios", response_model=ServiceOut)
def create_service(payload: ServiceCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    exists = db.query(Service).filter(Service.nombre == payload.nombre, Service.tenant == admin.tenant).first()
    if exists:
        raise HTTPException(status_code=400, detail="Ya existe un servicio con ese nombre en este negocio.")
    service = Service(**payload.model_dump(), tenant=admin.tenant)
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.patch("/servicios/{service_id}", response_model=ServiceOut)
def update_service(
    service_id: int,
    payload: ServiceUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    service = db.query(Service).filter(Service.id == service_id, Service.tenant == admin.tenant).first()
    if not service:
        raise HTTPException(status_code=404, detail="Servicio no encontrado.")
    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(service, key, value)
    db.commit()
    db.refresh(service)
    return service


@router.get("/servicios", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return db.query(Service).filter(Service.tenant == admin.tenant).order_by(Service.nombre.asc()).all()


@router.get("/resumen")
def admin_summary(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    now = datetime.now()
    tenant = admin.tenant
    next_appointment = (
        db.query(Appointment)
        .join(Service)
        .join(User)
        .filter(
            Appointment.estado == "agendada",
            Appointment.tenant == tenant,
            and_(Appointment.fecha > now.date()) | and_(Appointment.fecha == now.date(), Appointment.hora > now.time()),
        )
        .order_by(Appointment.fecha.asc(), Appointment.hora.asc())
        .first()
    )
    today_count = (
        db.query(func.count(Appointment.id))
        .filter(Appointment.fecha == date.today(), Appointment.tenant == tenant)
        .scalar()
    )

    return {
        "proxima_cita": (
            {
                "id": next_appointment.id,
                "cliente": next_appointment.usuario.nombre,
                "servicio": next_appointment.servicio.nombre,
                "fecha": next_appointment.fecha.isoformat(),
                "hora": next_appointment.hora.strftime("%H:%M"),
            }
            if next_appointment
            else None
        ),
        "citas_hoy": today_count,
    }
