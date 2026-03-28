require('dotenv').config();
const path = require('path');
const { execSync } = require('child_process');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const flash = require('connect-flash');
const methodOverride = require('method-override');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { PrismaClient, Role } = require('@prisma/client');

// ─────────────────────────────────────────
// Configuración de tenants
// ─────────────────────────────────────────
const TENANTS = {
  salon: {
    key: 'salon',
    nombre: 'Salón de Belleza',
    emoji: '💅',
    color: '#c084fc',   // lila
  },
  podologo: {
    key: 'podologo',
    nombre: 'Podólogo',
    emoji: '🦶',
    color: '#34d399',   // verde
  },
};

// ─────────────────────────────────────────
// Helpers de DB
// ─────────────────────────────────────────
function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  const parsed = new URL(rawUrl);
  if (parsed.searchParams.get('sslmode') === 'require' && !parsed.searchParams.has('uselibpqcompat')) {
    parsed.searchParams.set('uselibpqcompat', 'true');
  }
  return parsed.toString();
}

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = normalizeDatabaseUrl(process.env.DATABASE_URL);
}

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────
// Configuración Express
// ─────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '..', 'public')));

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

app.use(
  session({
    store: new pgSession({
      pool: pgPool,
      tableName: 'user_sessions',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 },
  })
);

app.use(flash());

// Variables globales para las vistas
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.tenant = req.session.tenant ? TENANTS[req.session.tenant] : null;
  res.locals.tenants = TENANTS;
  res.locals.error = req.flash('error');
  res.locals.success = req.flash('success');
  next();
});

// ─────────────────────────────────────────
// Middlewares de autenticación
// ─────────────────────────────────────────
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'ADMIN') {
    return res.status(403).send('Acceso denegado');
  }
  return next();
}

// Verifica que haya un tenant seleccionado en sesión
function requireTenant(req, res, next) {
  if (!req.session.tenant || !TENANTS[req.session.tenant]) {
    return res.redirect('/');
  }
  return next();
}

// ─────────────────────────────────────────
// RUTA RAÍZ — Selector de negocio
// ─────────────────────────────────────────
app.get('/', (req, res) => {
  // Si ya tiene sesión activa, redirigir al lugar correcto
  if (req.session.user && req.session.tenant) {
    return req.session.user.role === 'ADMIN'
      ? res.redirect('/admin')
      : res.redirect('/cliente');
  }
  // Limpiar tenant si no hay usuario
  req.session.tenant = null;
  return res.render('selector');
});

// El cliente elige a cuál negocio quiere entrar
app.get('/negocio/:tenant', (req, res) => {
  const { tenant } = req.params;
  if (!TENANTS[tenant]) return res.redirect('/');
  req.session.tenant = tenant;
  return res.redirect('/login');
});

// ─────────────────────────────────────────
// REGISTRO
// ─────────────────────────────────────────
app.get('/registro', requireTenant, (req, res) => res.render('register'));

app.post('/registro', requireTenant, async (req, res) => {
  const { fullName, email, password } = req.body;
  const tenant = req.session.tenant;

  if (!fullName || !email || !password) {
    req.flash('error', 'Todos los campos son obligatorios.');
    return res.redirect('/registro');
  }

  // Buscar si ya existe ese email EN ESTE tenant
  const exists = await prisma.user.findUnique({
    where: { email_tenant: { email, tenant } },
  });
  if (exists) {
    req.flash('error', 'Ese correo ya está registrado en este negocio.');
    return res.redirect('/registro');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { fullName, email, passwordHash, role: Role.CLIENT, tenant },
  });

  req.session.user = { id: user.id, fullName: user.fullName, role: user.role, tenant: user.tenant };
  req.flash('success', 'Registro exitoso.');
  return res.redirect('/cliente');
});

// ─────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────
app.get('/login', requireTenant, (req, res) => res.render('login'));

app.post('/login', requireTenant, async (req, res) => {
  const { email, password } = req.body;
  const tenant = req.session.tenant;

  // Buscar usuario SOLO dentro del tenant activo
  const user = await prisma.user.findUnique({
    where: { email_tenant: { email, tenant } },
  });

  if (!user) {
    req.flash('error', 'Credenciales inválidas o cuenta no válida para este negocio.');
    return res.redirect('/login');
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    req.flash('error', 'Credenciales inválidas.');
    return res.redirect('/login');
  }

  req.session.user = { id: user.id, fullName: user.fullName, role: user.role, tenant: user.tenant };
  return res.redirect('/');
});

// ─────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────
app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// ─────────────────────────────────────────
// CLIENTE — Dashboard
// ─────────────────────────────────────────
app.get('/cliente', requireAuth, requireTenant, async (req, res) => {
  const tenant = req.session.tenant;

  const services = await prisma.service.findMany({
    where: { tenant },
    orderBy: [{ area: 'asc' }, { name: 'asc' }],
  });

  const nextAppointment = await prisma.appointment.findFirst({
    where: { customerId: req.session.user.id, tenant, startsAt: { gte: new Date() } },
    include: { service: true },
    orderBy: { startsAt: 'asc' },
  });

  const appointments = await prisma.appointment.findMany({
    where: { customerId: req.session.user.id, tenant },
    include: { service: true },
    orderBy: { startsAt: 'asc' },
    take: 10,
  });

  return res.render('customer-dashboard', { services, nextAppointment, appointments });
});

// ─────────────────────────────────────────
// CLIENTE — Agendar cita
// ─────────────────────────────────────────
app.post('/citas', requireAuth, requireTenant, async (req, res) => {
  const { serviceId, startsAt, notes } = req.body;
  const tenant = req.session.tenant;

  if (!serviceId || !startsAt) {
    req.flash('error', 'Selecciona servicio y fecha/hora.');
    return res.redirect('/cliente');
  }

  const selectedDate = new Date(startsAt);
  if (Number.isNaN(selectedDate.getTime())) {
    req.flash('error', 'La fecha no es válida.');
    return res.redirect('/cliente');
  }

  // Verificar que el servicio pertenezca al tenant correcto (seguridad)
  const service = await prisma.service.findFirst({
    where: { id: Number(serviceId), tenant },
  });
  if (!service) {
    req.flash('error', 'Servicio no válido.');
    return res.redirect('/cliente');
  }

  try {
    await prisma.appointment.create({
      data: {
        customerId: req.session.user.id,
        serviceId: Number(serviceId),
        startsAt: selectedDate,
        notes,
        tenant,
      },
    });
    req.flash('success', 'Cita agendada con éxito.');
  } catch {
    req.flash('error', 'El horario ya está ocupado para ese servicio.');
  }
  return res.redirect('/cliente');
});

// ─────────────────────────────────────────
// ADMIN — Dashboard
// ─────────────────────────────────────────
app.get('/admin', requireAdmin, requireTenant, async (req, res) => {
  const tenant = req.session.tenant;

  const [appointments, clients, services, latestAppointment] = await Promise.all([
    prisma.appointment.findMany({
      where: { tenant },
      include: { customer: true, service: true },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.user.findMany({
      where: { role: Role.CLIENT, tenant },
      orderBy: { fullName: 'asc' },
    }),
    prisma.service.findMany({
      where: { tenant },
      orderBy: [{ area: 'asc' }, { name: 'asc' }],
    }),
    prisma.appointment.findFirst({
      where: { tenant },
      include: { customer: true, service: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const newCount = await prisma.appointment.count({
    where: {
      tenant,
      createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) },
    },
  });

  return res.render('admin-dashboard', { appointments, clients, services, latestAppointment, newCount });
});

// ─────────────────────────────────────────
// ADMIN — Crear cita
// ─────────────────────────────────────────
app.post('/admin/citas', requireAdmin, requireTenant, async (req, res) => {
  const { customerId, serviceId, startsAt, notes, status } = req.body;
  const tenant = req.session.tenant;

  await prisma.appointment.create({
    data: {
      customerId: Number(customerId),
      serviceId: Number(serviceId),
      startsAt: new Date(startsAt),
      notes,
      status: status || 'PROGRAMADA',
      tenant,
    },
  });
  req.flash('success', 'Cita creada.');
  return res.redirect('/admin');
});

// ─────────────────────────────────────────
// ADMIN — Editar cita
// ─────────────────────────────────────────
app.post('/admin/citas/:id', requireAdmin, requireTenant, async (req, res) => {
  const { serviceId, startsAt, notes, status } = req.body;
  await prisma.appointment.update({
    where: { id: Number(req.params.id) },
    data: {
      serviceId: Number(serviceId),
      startsAt: new Date(startsAt),
      notes,
      status,
    },
  });
  req.flash('success', 'Cita actualizada.');
  return res.redirect('/admin');
});

// ─────────────────────────────────────────
// ADMIN — Eliminar cita
// ─────────────────────────────────────────
app.delete('/admin/citas/:id', requireAdmin, requireTenant, async (req, res) => {
  await prisma.appointment.delete({ where: { id: Number(req.params.id) } });
  req.flash('success', 'Cita eliminada.');
  return res.redirect('/admin');
});

// ─────────────────────────────────────────
// Arranque
// ─────────────────────────────────────────
function runMigrationsIfNeeded() {
  if (process.env.RUN_MIGRATIONS_ON_STARTUP === 'false') {
    console.log('RUN_MIGRATIONS_ON_STARTUP=false — se omite prisma migrate deploy.');
    return;
  }
  console.log('Ejecutando prisma migrate deploy...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
}

async function bootstrap() {
  try {
    runMigrationsIfNeeded();
    await prisma.$connect();
    app.listen(PORT, () => {
      console.log(`Servidor en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar la aplicación:', error);
    process.exit(1);
  }
}

bootstrap();
