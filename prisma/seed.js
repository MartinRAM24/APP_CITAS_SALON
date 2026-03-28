require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient, Role } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  // ── Admin del Salón ──
  const salonAdminEmail = process.env.SALON_ADMIN_EMAIL || 'admin@salon.com';
  const salonAdminPassword = process.env.SALON_ADMIN_PASSWORD || 'Admin123!';
  await prisma.user.upsert({
    where: { email_tenant: { email: salonAdminEmail, tenant: 'salon' } },
    update: {},
    create: {
      fullName: 'Administradora Salón',
      email: salonAdminEmail,
      passwordHash: await bcrypt.hash(salonAdminPassword, 10),
      role: Role.ADMIN,
      tenant: 'salon',
    },
  });

  // ── Admin del Podólogo ──
  const podAdminEmail = process.env.POD_ADMIN_EMAIL || 'admin@podologo.com';
  const podAdminPassword = process.env.POD_ADMIN_PASSWORD || 'Admin123!';
  await prisma.user.upsert({
    where: { email_tenant: { email: podAdminEmail, tenant: 'podologo' } },
    update: {},
    create: {
      fullName: 'Administrador Podólogo',
      email: podAdminEmail,
      passwordHash: await bcrypt.hash(podAdminPassword, 10),
      role: Role.ADMIN,
      tenant: 'podologo',
    },
  });

  // ── Servicios del Salón ──
  const salonServices = [
    { name: 'Corte de cabello', area: 'Cabello', durationMins: 60, price: 250 },
    { name: 'Tinte completo',   area: 'Cabello', durationMins: 120, price: 850 },
    { name: 'Manicure spa',     area: 'Uñas',    durationMins: 50,  price: 320 },
    { name: 'Pedicure spa',     area: 'Uñas',    durationMins: 60,  price: 350 },
    { name: 'Limpieza facial',  area: 'Facial',  durationMins: 70,  price: 480 },
  ];

  for (const s of salonServices) {
    // Insertar solo si no existe ese nombre en ese tenant
    const exists = await prisma.service.findFirst({ where: { name: s.name, tenant: 'salon' } });
    if (!exists) await prisma.service.create({ data: { ...s, tenant: 'salon' } });
  }

  // ── Servicios del Podólogo ──
  const podServices = [
    { name: 'Revisión general de pies', area: 'Diagnóstico', durationMins: 30,  price: 200 },
    { name: 'Extracción de callos',     area: 'Tratamiento', durationMins: 45,  price: 350 },
    { name: 'Uñas encarnadas',          area: 'Tratamiento', durationMins: 60,  price: 500 },
    { name: 'Pedicura medicada',        area: 'Estética',    durationMins: 60,  price: 400 },
    { name: 'Ortesis plantar',          area: 'Ortopedia',   durationMins: 90,  price: 800 },
  ];

  for (const s of podServices) {
    const exists = await prisma.service.findFirst({ where: { name: s.name, tenant: 'podologo' } });
    if (!exists) await prisma.service.create({ data: { ...s, tenant: 'podologo' } });
  }

  console.log('✅ Seed completado.');
  console.log('   Salón admin:', salonAdminEmail);
  console.log('   Podólogo admin:', podAdminEmail);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
