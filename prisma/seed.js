require('dotenv').config();
const bcrypt = require('bcryptjs');
const { PrismaClient, Role } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'duena@salon.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin123!';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      fullName: 'Dueña del salón',
      email: adminEmail,
      passwordHash,
      role: Role.ADMIN,
    },
  });

  const services = [
    { name: 'Corte de cabello', area: 'Cabello', durationMins: 60, price: 250 },
    { name: 'Tinte completo', area: 'Cabello', durationMins: 120, price: 850 },
    { name: 'Manicure spa', area: 'Uñas', durationMins: 50, price: 320 },
    { name: 'Limpieza facial', area: 'Facial', durationMins: 70, price: 480 }
  ];

  for (const service of services) {
    await prisma.service.upsert({
      where: { id: services.indexOf(service) + 1 },
      update: service,
      create: service,
    });
  }

  console.log('Seed completado. Admin:', adminEmail);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
