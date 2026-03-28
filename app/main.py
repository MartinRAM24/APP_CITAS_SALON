"""Main FastAPI application — multi-tenant."""

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.auth import hash_password
from app.database import Base, SessionLocal, engine
from app.models import Service, User
from app.routes import admin, auth, cliente

app = FastAPI(title="Salon & Podólogo App", version="2.0.0")

origins = [origin.strip() for origin in os.getenv("CORS_ORIGINS", "*").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


def resolve_logo_src() -> str:
    logo_url = os.getenv("LOGO_URL", "").strip()
    if logo_url:
        return logo_url
    if os.path.exists("static/logo.png"):
        return "/static/logo.png"
    return "/static/logo.svg"


app.include_router(auth.router)
app.include_router(cliente.router)
app.include_router(admin.router)


@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        _seed_admin(db, tenant="salon",
                    env_email="SALON_ADMIN_EMAIL", env_phone="SALON_ADMIN_PHONE",
                    env_password="SALON_ADMIN_PASSWORD", env_name="SALON_ADMIN_NAME",
                    default_name="Administradora Salón")

        _seed_admin(db, tenant="podologo",
                    env_email="POD_ADMIN_EMAIL", env_phone="POD_ADMIN_PHONE",
                    env_password="POD_ADMIN_PASSWORD", env_name="POD_ADMIN_NAME",
                    default_name="Administrador Podólogo")

        _seed_services(db)
        db.commit()
    finally:
        db.close()


def _seed_admin(db, *, tenant, env_email, env_phone, env_password, env_name, default_name):
    email = os.getenv(env_email)
    phone = os.getenv(env_phone)
    password = os.getenv(env_password)
    name = os.getenv(env_name, default_name)
    if not (email and phone and password):
        return
    exists = db.query(User).filter(User.email == email, User.tenant == tenant).first()
    if not exists:
        if len(password.encode("utf-8")) <= 72:
            db.add(User(
                nombre=name, telefono=phone, email=email,
                password_hash=hash_password(password),
                rol="admin", tenant=tenant,
            ))
        else:
            print(f"[startup] {env_password} excede 72 bytes — admin de '{tenant}' no creado.")


def _seed_services(db):
    # Servicios del salón
    salon_services = [
        Service(nombre="Corte + Peinado", duracion_minutos=60, precio=35.0, tenant="salon"),
        Service(nombre="Manicure Premium", duracion_minutos=45, precio=25.0, tenant="salon"),
        Service(nombre="Coloración Completa", duracion_minutos=120, precio=70.0, tenant="salon"),
    ]
    if not db.query(Service).filter(Service.tenant == "salon").first():
        db.add_all(salon_services)

    # Servicios del podólogo
    pod_services = [
        Service(nombre="Revisión general de pies", duracion_minutos=30, precio=20.0, tenant="podologo"),
        Service(nombre="Extracción de callos", duracion_minutos=45, precio=35.0, tenant="podologo"),
        Service(nombre="Uñas encarnadas", duracion_minutos=60, precio=50.0, tenant="podologo"),
        Service(nombre="Pedicura medicada", duracion_minutos=60, precio=40.0, tenant="podologo"),
    ]
    if not db.query(Service).filter(Service.tenant == "podologo").first():
        db.add_all(pod_services)


# ── Rutas HTML ────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("home.html", {"request": request, "logo_src": resolve_logo_src()})


@app.get("/cliente", response_class=HTMLResponse)
def cliente_panel(request: Request):
    return templates.TemplateResponse("cliente.html", {"request": request, "logo_src": resolve_logo_src()})


@app.get("/admin", response_class=HTMLResponse)
def admin_panel(request: Request):
    return templates.TemplateResponse("admin.html", {"request": request, "logo_src": resolve_logo_src()})
