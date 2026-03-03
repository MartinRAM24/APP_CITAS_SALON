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
3. Configura comandos:
   - Build: `npm install && npm run prisma:generate`
   - Start: `npm run prisma:deploy && npm start`
4. Deploy.

## Credenciales admin inicial
Se crean por `npm run prisma:seed` usando:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

## Rutas principales
- `/registro` cliente se registra
- `/login` inicio de sesión
- `/cliente` dashboard cliente
- `/admin` dashboard dueña
