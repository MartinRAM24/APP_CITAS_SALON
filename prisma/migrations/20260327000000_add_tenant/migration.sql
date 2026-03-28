-- Agregar el enum Tenant
CREATE TYPE "Tenant" AS ENUM ('salon', 'podologo');

-- Agregar tenant a User (existentes quedan en salon)
ALTER TABLE "User" ADD COLUMN "tenant" "Tenant" NOT NULL DEFAULT 'salon';

-- Cambiar unique de solo email a email+tenant
ALTER TABLE "User" DROP CONSTRAINT "User_email_key";
ALTER TABLE "User" ADD CONSTRAINT "User_email_tenant_key" UNIQUE ("email", "tenant");

-- Agregar tenant a Service
ALTER TABLE "Service" ADD COLUMN "tenant" "Tenant" NOT NULL DEFAULT 'salon';

-- Agregar tenant a Appointment
ALTER TABLE "Appointment" ADD COLUMN "tenant" "Tenant" NOT NULL DEFAULT 'salon';

-- Índice para consultas por tenant
CREATE INDEX "Appointment_tenant_startsAt_idx" ON "Appointment"("tenant", "startsAt");
