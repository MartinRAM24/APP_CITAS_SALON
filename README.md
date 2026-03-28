# App de Citas — Multi-tenant (Salón + Podólogo)

## Cómo funciona
1. El usuario entra a la URL raíz `/`
2. Elige el negocio (Salón de Belleza o Podólogo)
3. Se registra o inicia sesión **dentro de ese negocio**
4. El token JWT incluye el `tenant` — el backend valida cada request contra él
5. Un usuario del salón **no puede** entrar al podólogo con la misma cuenta, y viceversa

## Archivos modificados
| Archivo | Qué cambió |
|---|---|
| `app/models.py` | Campo `tenant` en User, Service, Appointment |
| `app/auth.py` | `tenant` incluido en JWT; `authenticate_user` filtra por tenant |
| `app/schemas.py` | `tenant` en UserCreate, LoginData, Token |
| `app/routes/auth.py` | Register y login validan y asignan tenant |
| `app/routes/cliente.py` | Todas las queries filtran por `user.tenant` |
| `app/routes/admin.py` | Todas las queries filtran por `admin.tenant` |
| `app/main.py` | Seed de 2 admins y servicios de ambos negocios |
| `templates/home.html` | Pantalla selector de negocio |
| `static/home.js` | Lógica del selector; manda `tenant` en register/login |
| `static/cliente.js` | Redirige a `/` en lugar de `/login` si no hay token |
| `static/admin.js` | Redirige a `/` en lugar de `/login` si no hay token |
| `.env.example` | Variables para ambos admins |

## Variables de entorno
Ver `.env.example`

## Deploy en Railway
Las tablas se crean automáticamente al arrancar (`Base.metadata.create_all`).
Los admins y servicios se insertan solos en el startup si no existen.
Solo necesitas poner las variables de entorno en Railway y hacer deploy.

## Agregar un tercer negocio en el futuro
1. En `app/models.py`: agregar el valor al tuple `TENANTS`
2. En `app/schemas.py`: agregar el literal a `VALID_TENANTS`
3. En `app/main.py`: agregar `_seed_admin(...)` y servicios iniciales
4. En `static/home.js`: agregar entrada al objeto `TENANTS`
5. En `templates/home.html`: agregar la tarjeta del nuevo negocio
