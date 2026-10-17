import 'dotenv/config';
import argon2 from 'argon2';
import { closePrisma, getPrisma } from '../src/config/database.js';
import { getEnv } from '../src/config/env.js';
import { jsonValue } from '../src/modules/games/game.shared.js';

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

  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: { tenantId: tenant.id },
  });

  interface TaxonomyDelegate {
    findFirst(args: {
      where: { tenantId: string | null; slug: string };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: { tenantId: string | null; name: string; slug: string };
    }): Promise<{ id: string }>;
    update(args: { where: { id: string }; data: { name: string } }): Promise<unknown>;
  }

  async function ensureTaxonomy(
    model: TaxonomyDelegate,
    tenantId: string | null,
    name: string,
    slug: string,
  ): Promise<string> {
    const existing = await model.findFirst({ where: { tenantId, slug } });
    if (existing) {
      await model.update({ where: { id: existing.id }, data: { name } });
      return existing.id;
    }
    const created = await model.create({ data: { tenantId, name, slug } });
    return created.id;
  }

  const globalCategoryAccion = await ensureTaxonomy(prisma.category, null, 'Acción', 'accion');
  const globalGenreRpg = await ensureTaxonomy(prisma.genre, null, 'RPG', 'rpg');
  const globalGenreAventura = await ensureTaxonomy(prisma.genre, null, 'Aventura', 'aventura');
  const globalPlatformPc = await ensureTaxonomy(prisma.platform, null, 'PC', 'pc');
  const globalPlatformPs5 = await ensureTaxonomy(prisma.platform, null, 'PlayStation 5', 'ps5');
  const globalPlatformPs4 = await ensureTaxonomy(prisma.platform, null, 'PlayStation 4', 'ps4');
  const globalPlatformXboxSeries = await ensureTaxonomy(
    prisma.platform,
    null,
    'Xbox Series X',
    'xbox-series-x',
  );
  const globalPlatformXboxOne = await ensureTaxonomy(prisma.platform, null, 'Xbox One', 'xbox-one');
  const globalPlatformSwitch = await ensureTaxonomy(
    prisma.platform,
    null,
    'Nintendo Switch',
    'switch',
  );

  const globalPlatforms = [
    globalPlatformPc,
    globalPlatformPs5,
    globalPlatformPs4,
    globalPlatformXboxSeries,
    globalPlatformXboxOne,
    globalPlatformSwitch,
  ];

  const tenants = await prisma.tenant.findMany({ select: { id: true, slug: true } });

  for (const target of tenants) {
    for (const platformId of globalPlatforms) {
      await prisma.tenantPlatform.upsert({
        where: { tenantId_platformId: { tenantId: target.id, platformId } },
        update: {},
        create: { tenantId: target.id, platformId, enabled: true },
      });
    }
  }

  const globalDictionaryGenres: Array<[string, string]> = [
    ['Arcade', 'arcade'],
    ['Aventura', 'aventura'],
    ['Carreras', 'carreras'],
    ['Cartas', 'cartas'],
    ['Deportes', 'deportes'],
    ['Estrategia', 'estrategia'],
    ['Indie', 'indie'],
    ['Lucha', 'lucha'],
    ['Música', 'musica'],
    ['Plataformas', 'plataformas'],
    ['Puzzle', 'puzzle'],
    ['Rol', 'rol'],
    ['Shooter', 'shooter'],
    ['Simulación', 'simulacion'],
  ];

  const globalDictionaryCategories: Array<[string, string]> = [
    ['Acción', 'accion'],
    ['Aventura', 'aventura'],
    ['Deportes', 'deportes'],
    ['Puzzle', 'puzzle'],
    ['Rol', 'rol'],
    ['Sigilo', 'sigilo'],
    ['Simulación', 'simulacion'],
    ['Terror', 'terror'],
  ];

  for (const [name, slug] of globalDictionaryGenres) {
    await ensureTaxonomy(prisma.genre, null, name, slug);
  }

  for (const [name, slug] of globalDictionaryCategories) {
    await ensureTaxonomy(prisma.category, null, name, slug);
  }

  const tenantCategoryAccion = await ensureTaxonomy(prisma.category, tenant.id, 'Acción', 'accion');
  const tenantGenreRpg = await ensureTaxonomy(prisma.genre, tenant.id, 'RPG', 'rpg');
  const tenantGenreAventura = await ensureTaxonomy(prisma.genre, tenant.id, 'Aventura', 'aventura');
  const tenantPlatformPc = await ensureTaxonomy(prisma.platform, tenant.id, 'PC', 'pc');
  const tenantPlatformPs5 = await ensureTaxonomy(
    prisma.platform,
    tenant.id,
    'PlayStation 5',
    'ps5',
  );

  const baseRequirements = {
    cpu: 'Intel Core i5-4460',
    gpu: 'GTX 960 4GB',
    ram: '8 GB',
    os: 'Windows 10 64 bits',
  };
  const recommendedRequirements = {
    cpu: 'Intel Core i7-8700',
    gpu: 'GTX 1060 6GB',
    ram: '16 GB',
    os: 'Windows 10 64 bits',
  };

  interface BaseGameInput {
    title: string;
    slug: string;
    description: string;
    sizeValue: number;
    sizeUnit: 'MB' | 'GB' | 'TB';
    releaseYear: number;
    categoryId: string | null;
    genreIds: string[];
    platformIds: string[];
  }

  async function ensureBaseGame(input: BaseGameInput): Promise<string> {
    const data = {
      title: input.title,
      slug: input.slug,
      description: input.description,
      sizeValue: input.sizeValue,
      sizeUnit: input.sizeUnit,
      releaseYear: input.releaseYear,
      categoryId: input.categoryId,
      minimumRequirements: baseRequirements,
      recommendedRequirements,
    };

    const existing = await prisma.baseGame.findFirst({ where: { slug: input.slug } });
    let id: string;

    if (existing) {
      await prisma.baseGame.update({ where: { id: existing.id }, data });
      id = existing.id;
    } else {
      id = (await prisma.baseGame.create({ data })).id;
    }

    if (input.genreIds.length) {
      await prisma.baseGameGenre.deleteMany({ where: { baseGameId: id } });
      await prisma.baseGameGenre.createMany({
        data: input.genreIds.map((genreId) => ({ baseGameId: id, genreId })),
      });
    }

    if (input.platformIds.length) {
      await prisma.baseGamePlatform.deleteMany({ where: { baseGameId: id } });
      await prisma.baseGamePlatform.createMany({
        data: input.platformIds.map((platformId) => ({ baseGameId: id, platformId })),
      });
    }

    return id;
  }

  const hadesId = await ensureBaseGame({
    title: 'Hades',
    slug: 'hades',
    description: 'Roguelike de acción mitológico',
    sizeValue: 15,
    sizeUnit: 'GB',
    releaseYear: 2020,
    categoryId: globalCategoryAccion,
    genreIds: [globalGenreRpg, globalGenreAventura],
    platformIds: [globalPlatformPc, globalPlatformPs5],
  });

  await ensureBaseGame({
    title: 'Celeste',
    slug: 'celeste',
    description: 'Plataformas indie con narrativa emotiva',
    sizeValue: 1200,
    sizeUnit: 'MB',
    releaseYear: 2018,
    categoryId: null,
    genreIds: [],
    platformIds: [globalPlatformPc],
  });

  interface TenantGameInput {
    baseGameId: string | null;
    platformId: string;
    origin: 'BIBLIOTECA' | 'PERSONALIZADO';
    title: string;
    slug: string;
    description: string;
    priceMode: 'RULE' | 'MANUAL';
    price: number | null;
    availability: boolean;
    sizeValue: number;
    sizeUnit: 'MB' | 'GB' | 'TB';
    releaseYear: number;
    categoryId: string | null;
    genreIds: string[];
    platformIds: string[];
    minimumRequirements?: typeof baseRequirements;
    recommendedRequirements?: typeof baseRequirements;
  }

  async function ensureTenantGame(input: TenantGameInput): Promise<string> {
    const data = {
      tenantId: tenant.id,
      baseGameId: input.baseGameId,
      platformId: input.platformId,
      origin: input.origin,
      title: input.title,
      slug: input.slug,
      description: input.description,
      priceMode: input.priceMode,
      price: input.price,
      availability: input.availability,
      sizeValue: input.sizeValue,
      sizeUnit: input.sizeUnit,
      releaseYear: input.releaseYear,
      categoryId: input.categoryId,
      minimumRequirements: jsonValue(input.minimumRequirements ?? null),
      recommendedRequirements: jsonValue(input.recommendedRequirements ?? null),
    };

    const existing = await prisma.tenantGame.findFirst({
      where: { tenantId: tenant.id, slug: input.slug },
    });
    let id: string;

    if (existing) {
      await prisma.tenantGame.update({ where: { id: existing.id }, data });
      id = existing.id;
    } else {
      id = (await prisma.tenantGame.create({ data })).id;
    }

    if (input.genreIds.length) {
      await prisma.tenantGameGenre.deleteMany({ where: { tenantGameId: id } });
      await prisma.tenantGameGenre.createMany({
        data: input.genreIds.map((genreId) => ({ tenantGameId: id, genreId })),
      });
    }

    if (input.platformIds.length) {
      await prisma.gamePlatform.deleteMany({ where: { tenantGameId: id } });
      await prisma.gamePlatform.createMany({
        data: input.platformIds.map((platformId) => ({ tenantGameId: id, platformId })),
      });
    }

    return id;
  }

  await ensureTenantGame({
    baseGameId: hadesId,
    platformId: globalPlatformPc,
    origin: 'BIBLIOTECA',
    title: 'Hades',
    slug: 'hades',
    description: 'Roguelike de acción mitológico',
    priceMode: 'MANUAL',
    price: 19.99,
    availability: true,
    sizeValue: 15,
    sizeUnit: 'GB',
    releaseYear: 2020,
    categoryId: tenantCategoryAccion,
    genreIds: [tenantGenreRpg, tenantGenreAventura],
    platformIds: [tenantPlatformPc, tenantPlatformPs5],
    minimumRequirements: baseRequirements,
    recommendedRequirements,
  });

  await ensureTenantGame({
    baseGameId: null,
    platformId: globalPlatformPc,
    origin: 'PERSONALIZADO',
    title: 'Pack Mods Javier',
    slug: 'pack-mods-javier',
    description: 'Colección de mods personalizados del tenant',
    priceMode: 'RULE',
    price: null,
    availability: true,
    sizeValue: 500,
    sizeUnit: 'MB',
    releaseYear: 2024,
    categoryId: tenantCategoryAccion,
    genreIds: [tenantGenreRpg],
    platformIds: [tenantPlatformPc],
    minimumRequirements: baseRequirements,
    recommendedRequirements,
  });

  interface PricingRuleInput {
    minSize: number;
    maxSize: number | null;
    price: number;
  }

  async function ensurePricingRule(input: PricingRuleInput): Promise<void> {
    const existing = await prisma.pricingRule.findFirst({
      where: { tenantId: tenant.id, minSize: input.minSize },
    });

    if (existing) {
      await prisma.pricingRule.update({
        where: { id: existing.id },
        data: { maxSize: input.maxSize, price: input.price, active: true },
      });
    } else {
      await prisma.pricingRule.create({
        data: {
          id: crypto.randomUUID(),
          tenantId: tenant.id,
          minSize: input.minSize,
          maxSize: input.maxSize,
          price: input.price,
        },
      });
    }
  }

  await ensurePricingRule({ minSize: 1, maxSize: 10, price: 40 });
  await ensurePricingRule({ minSize: 10.01, maxSize: 50, price: 50 });
  await ensurePricingRule({ minSize: 50.01, maxSize: 100, price: 70 });
  await ensurePricingRule({ minSize: 100.01, maxSize: null, price: 100 });

  const existingCatalog = await prisma.catalogMetadata.findFirst({
    where: { tenantId: tenant.id },
  });
  if (!existingCatalog) {
    await prisma.catalogMetadata.create({
      data: { id: crypto.randomUUID(), tenantId: tenant.id, version: 1 },
    });
  }

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
  console.log('juegos de ejemplo: hades (biblioteca), pack-mods-javier (personalizado)');
  console.log('reglas de precio: 4 rangos (1-10, 10.01-50, 50.01-100, 100.01+)');
  console.log('catálogo: versión inicial 1 (creada solo si no existía)');
}

main()
  .then(() => closePrisma())
  .catch(async (error) => {
    console.error(error);
    await closePrisma();
    process.exit(1);
  });
