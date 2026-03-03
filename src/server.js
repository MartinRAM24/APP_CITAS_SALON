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

function normalizeDatabaseUrl(rawUrl) {
  if (!rawUrl) {
    return rawUrl;
  }

  const parsed = new URL(rawUrl);
  const sslMode = parsed.searchParams.get('sslmode');
  const hasLibpqCompat = parsed.searchParams.has('uselibpqcompat');

  if (sslMode === 'require' && !hasLibpqCompat) {
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
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  res.locals.error = req.flash('error');
  res.locals.success = req.flash('success');
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'ADMIN') {
    return res.status(403).send('Acceso denegado');
  }
  return next();
}

app.get('/', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.role === 'ADMIN') {
    return res.redirect('/admin');
  }
  return res.redirect('/cliente');
});

app.get('/registro', (req, res) => res.render('register'));
app.post('/registro', async (req, res) => {
  const { fullName, email, password } = req.body;

  if (!fullName || !email || !password) {
    req.flash('error', 'Todos los campos son obligatorios.');
    return res.redirect('/registro');
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    req.flash('error', 'Ese correo ya está registrado.');
    return res.redirect('/registro');
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { fullName, email, passwordHash, role: Role.CLIENT },
  });

  req.session.user = { id: user.id, fullName: user.fullName, role: user.role };
  req.flash('success', 'Registro exitoso.');
  return res.redirect('/cliente');
});

app.get('/login', (req, res) => res.render('login'));
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    req.flash('error', 'Credenciales inválidas.');
    return res.redirect('/login');
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    req.flash('error', 'Credenciales inválidas.');
    return res.redirect('/login');
  }

  req.session.user = { id: user.id, fullName: user.fullName, role: user.role };
  return res.redirect('/');
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

app.get('/cliente', requireAuth, async (req, res) => {
  const services = await prisma.service.findMany({ orderBy: [{ area: 'asc' }, { name: 'asc' }] });
  const nextAppointment = await prisma.appointment.findFirst({
    where: { customerId: req.session.user.id, startsAt: { gte: new Date() } },
    include: { service: true },
    orderBy: { startsAt: 'asc' },
  });

  const appointments = await prisma.appointment.findMany({
    where: { customerId: req.session.user.id },
    include: { service: true },
    orderBy: { startsAt: 'asc' },
    take: 10,
  });

  return res.render('customer-dashboard', { services, nextAppointment, appointments });
});

app.post('/citas', requireAuth, async (req, res) => {
  const { serviceId, startsAt, notes } = req.body;

  if (!serviceId || !startsAt) {
    req.flash('error', 'Selecciona servicio y fecha/hora.');
    return res.redirect('/cliente');
  }

  const selectedDate = new Date(startsAt);
  if (Number.isNaN(selectedDate.getTime())) {
    req.flash('error', 'La fecha no es válida.');
    return res.redirect('/cliente');
  }

  try {
    await prisma.appointment.create({
      data: {
        customerId: req.session.user.id,
        serviceId: Number(serviceId),
        startsAt: selectedDate,
        notes,
      },
    });
    req.flash('success', 'Cita agendada con éxito.');
  } catch (error) {
    req.flash('error', 'El horario ya está ocupado para ese servicio.');
  }
  return res.redirect('/cliente');
});

app.get('/admin', requireAdmin, async (req, res) => {
  const [appointments, clients, services, latestAppointment] = await Promise.all([
    prisma.appointment.findMany({
      include: { customer: true, service: true },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.user.findMany({ where: { role: Role.CLIENT }, orderBy: { fullName: 'asc' } }),
    prisma.service.findMany({ orderBy: [{ area: 'asc' }, { name: 'asc' }] }),
    prisma.appointment.findFirst({ include: { customer: true, service: true }, orderBy: { createdAt: 'desc' } }),
  ]);

  const newCount = await prisma.appointment.count({
    where: {
      createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) },
    },
  });

  return res.render('admin-dashboard', { appointments, clients, services, latestAppointment, newCount });
});

app.post('/admin/citas', requireAdmin, async (req, res) => {
  const { customerId, serviceId, startsAt, notes, status } = req.body;
  await prisma.appointment.create({
    data: {
      customerId: Number(customerId),
      serviceId: Number(serviceId),
      startsAt: new Date(startsAt),
      notes,
      status: status || 'PROGRAMADA',
    },
  });
  req.flash('success', 'Cita creada por administradora.');
  return res.redirect('/admin');
});

app.post('/admin/citas/:id', requireAdmin, async (req, res) => {
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

app.delete('/admin/citas/:id', requireAdmin, async (req, res) => {
  await prisma.appointment.delete({ where: { id: Number(req.params.id) } });
  req.flash('success', 'Cita eliminada.');
  return res.redirect('/admin');
});

function runMigrationsIfNeeded() {
  const shouldRunMigrations = process.env.RUN_MIGRATIONS_ON_STARTUP !== 'false';

  if (!shouldRunMigrations) {
    console.log('RUN_MIGRATIONS_ON_STARTUP=false, se omite prisma migrate deploy.');
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
      console.log(`Servidor iniciado en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('No se pudo iniciar la aplicación:', error);
    process.exit(1);
  }
}

bootstrap();
