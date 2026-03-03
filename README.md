# APP CITAS SALÓN (Railway + Neon Postgres)

Sistema web para un local de belleza que permite:
- Registro e inicio de sesión de clientes.
- Agenda de citas por hora con selección de servicio/área.
- Panel de administradora para crear, revisar, modificar y eliminar citas.
- Vista de próxima cita del cliente.
- Notificación para dueña con últimas citas agendadas.

## Stack
- Node.js + Express + EJS
- Prisma ORM
- Neon Postgres
- Deploy pensado para Railway

## Configuración local
1. Instala dependencias:
   ```bash
   npm install
   ```
2. Copia variables:
   ```bash
   cp .env.example .env
   ```
3. Coloca tu `DATABASE_URL` de Neon en `.env`.
4. Ejecuta migraciones y seed:
   ```bash
   npm run prisma:migrate
   npm run prisma:seed
   ```
5. Inicia la app:
   ```bash
   npm run dev
   ```

## Deploy en Railway
1. Crea proyecto en Railway y conecta este repositorio.
2. En Variables agrega:
   - `DATABASE_URL` (Neon)
   - `SESSION_SECRET`
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `RUN_MIGRATIONS_ON_STARTUP=true`
3. Configura comandos:
   - Build: `npm install`
   - Start: `npm start`
4. Deploy.

> Al iniciar, la app ejecuta `prisma migrate deploy` automáticamente para evitar el error `P2021: table does not exist` cuando la base está vacía.

## Credenciales admin inicial
Se crean por `npm run prisma:seed` usando:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## Rutas principales
- `/registro` cliente se registra
- `/login` inicio de sesión
- `/cliente` dashboard cliente
- `/admin` dashboard dueña

## Troubleshooting de deploy
### Warning SSL `pg-connection-string`
Si tu `DATABASE_URL` usa `sslmode=require`, la app añade automáticamente `uselibpqcompat=true` para compatibilidad con el warning de `pg` v8/v9.

### Error `P2021 The table public.User does not exist`
Este repo ya incluye migración inicial en `prisma/migrations` y la ejecuta al iniciar.
Si quieres forzarlo manualmente:
```bash
npx prisma migrate deploy
```
