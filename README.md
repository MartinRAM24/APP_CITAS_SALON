# App de Citas — Multi-tenant (Salón + Podólogo)

Una sola aplicación, dos negocios completamente independientes.

## Negocios disponibles
| Tenant | Clave | Admin por defecto |
|--------|-------|-------------------|
| Salón de Belleza | `salon` | `SALON_ADMIN_EMAIL` |
| Podólogo | `podologo` | `POD_ADMIN_EMAIL` |

## Flujo del usuario
1. El cliente entra a la URL raíz `/`
2. Elige el negocio (salón o podólogo)
3. Inicia sesión o se registra **dentro de ese negocio**
4. Sus datos y citas son completamente privados al negocio elegido

## Seguridad multi-tenant
- Un usuario del salón **no puede** iniciar sesión en el podólogo y viceversa
- El email puede repetirse entre negocios (son cuentas independientes)
- Todas las consultas a la base de datos filtran por `tenant`
- Al crear citas se verifica que el servicio pertenezca al tenant correcto

## Variables de entorno requeridas
Ver `.env.example`

## Comandos

```bash
# Instalar dependencias
npm install

# Correr la migración en producción
npx prisma migrate deploy

# Poblar la base de datos (admins + servicios de ambos negocios)
node prisma/seed.js

# Desarrollo local
npm run dev
```

## Agregar un tercer negocio en el futuro
1. Agregar el nuevo valor al enum `Tenant` en `prisma/schema.prisma`
2. Crear una nueva migración: `npx prisma migrate dev --name add_nuevo_negocio`
3. Agregar el tenant al objeto `TENANTS` en `src/server.js`
4. Agregar sus servicios en `prisma/seed.js`
