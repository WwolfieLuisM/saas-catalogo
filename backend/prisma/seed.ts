import 'dotenv/config';
import argon2 from 'argon2';
import { closePrisma, getPrisma } from '../src/config/database.js';
import { getEnv } from '../src/config/env.js';

async function main() {
  const env = getEnv();

  if (!env.SEED_ADMIN_USERNAME || !env.SEED_ADMIN_PASSWORD) {
    throw new Error('SEED_ADMIN_USERNAME y SEED_ADMIN_PASSWORD son requeridos para el seed');
  }

  const prisma = getPrisma();

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'javier' },
    update: { name: 'Javier', isActive: true },
    create: { name: 'Javier', slug: 'javier' },
  });

  const superAdminHash = await argon2.hash(env.SEED_ADMIN_PASSWORD, { type: argon2.argon2id });
  const superAdmin = await prisma.adminUser.upsert({
    where: { username: env.SEED_ADMIN_USERNAME },
    update: {
      role: 'SUPER_ADMIN',
      tenantId: null,
      isActive: true,
      passwordHash: superAdminHash,
    },
    create: {
      username: env.SEED_ADMIN_USERNAME,
      passwordHash: superAdminHash,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  console.log(`tenant: ${tenant.slug} (${tenant.id})`);
  console.log(`super admin: ${superAdmin.username}`);

  if (!env.SEED_JAVIER_ADMIN_PASSWORD) {
    console.log('admin de Javier omitido: falta SEED_JAVIER_ADMIN_PASSWORD');
    return;
  }

  const javierUsername = env.SEED_JAVIER_ADMIN_USERNAME ?? 'javier-admin';
  const javierHash = await argon2.hash(env.SEED_JAVIER_ADMIN_PASSWORD, { type: argon2.argon2id });
  const javierAdmin = await prisma.adminUser.upsert({
    where: { username: javierUsername },
    update: {
      role: 'ADMIN',
      tenantId: tenant.id,
      isActive: true,
      passwordHash: javierHash,
    },
    create: {
      username: javierUsername,
      passwordHash: javierHash,
      role: 'ADMIN',
      tenantId: tenant.id,
      isActive: true,
    },
  });

  console.log(`admin de Javier: ${javierAdmin.username}`);
}

main()
  .then(() => closePrisma())
  .catch(async (error) => {
    console.error(error);
    await closePrisma();
    process.exit(1);
  });
