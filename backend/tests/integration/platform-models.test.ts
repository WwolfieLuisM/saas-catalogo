import { beforeEach, describe, expect, it } from 'vitest';
import {
  addFakeBaseGame,
  addFakePlatform,
  addFakeTenant,
  addFakeTenantGame,
  addFakeTenantPlatform,
  fakeDb,
  resetFakeDb,
} from '../helpers/fakeDb.js';

const T_JAVIER = '11111111-1111-4111-8111-111111111111';
const T_OTRO = '22222222-2222-4222-8222-222222222222';
const BG_UNO = '33333333-3333-4333-8333-333333333333';
const BG_DOS = '44444444-4444-4444-8444-444444444444';
const PF_PC = '55555555-5555-4555-8555-555555555555';
const PF_PS4 = '66666666-6666-4666-8666-666666666666';

beforeEach(resetFakeDb);

describe('BaseGamePlatform con variante por plataforma', () => {
  it('persiste size, requirements y provenance de la variante', async () => {
    addFakeBaseGame({ id: BG_UNO, title: 'Hollow Knight', slug: 'hollow-knight' });
    addFakePlatform({ id: PF_PC, tenantId: null, name: 'PC', slug: 'pc' });

    await fakeDb.baseGamePlatform.createMany({
      data: [
        {
          baseGameId: BG_UNO,
          platformId: PF_PC,
          sizeValue: 42.5,
          sizeUnit: 'GB',
          minimumRequirements: { cpu: 'i5', ram: '8 GB' },
          recommendedRequirements: { cpu: 'i7', ram: '16 GB' },
          provenance: { source: 'steam', externalId: '1234', confidence: 0.9 },
        },
      ],
    });

    const row = await fakeDb.baseGamePlatform.findFirst({ where: { baseGameId: BG_UNO } });
    expect(row?.sizeValue).toBe(42.5);
    expect(row?.sizeUnit).toBe('GB');
    expect(row?.minimumRequirements).toEqual({ cpu: 'i5', ram: '8 GB' });
    expect(row?.recommendedRequirements).toEqual({ cpu: 'i7', ram: '16 GB' });
    expect(row?.provenance).toEqual({ source: 'steam', externalId: '1234', confidence: 0.9 });
  });

  it('sin variante las columnas quedan vacías y se hereda de BaseGame', async () => {
    addFakeBaseGame({
      id: BG_DOS,
      title: 'Celeste',
      slug: 'celeste',
      sizeValue: 1.2,
      sizeUnit: 'GB',
    });
    addFakePlatform({ id: PF_PS4, tenantId: null, name: 'PS4', slug: 'ps4' });

    await fakeDb.baseGamePlatform.createMany({
      data: [{ baseGameId: BG_DOS, platformId: PF_PS4 }],
    });

    const row = await fakeDb.baseGamePlatform.findFirst({ where: { baseGameId: BG_DOS } });
    expect(row?.sizeValue ?? null).toBeNull();
    expect(row?.sizeUnit ?? null).toBeNull();
    expect(row?.minimumRequirements ?? null).toBeNull();
    expect(row?.provenance ?? null).toBeNull();

    const base = await fakeDb.baseGame.findUnique({ where: { id: BG_DOS } });
    expect(base?.sizeValue).toBe(1.2);
    expect(base?.sizeUnit).toBe('GB');
  });
});

describe('TenantPlatform', () => {
  it('crea con enabled por defecto true', async () => {
    const row = await fakeDb.tenantPlatform.create({
      data: { tenantId: T_JAVIER, platformId: PF_PC },
    });
    expect(row.enabled).toBe(true);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it('rechaza el duplicado (tenantId, platformId)', async () => {
    await fakeDb.tenantPlatform.create({ data: { tenantId: T_JAVIER, platformId: PF_PC } });
    await expect(
      fakeDb.tenantPlatform.create({ data: { tenantId: T_JAVIER, platformId: PF_PC } }),
    ).rejects.toThrow(/Unique constraint/);
  });

  it('upsert idempotente y update de enabled', async () => {
    const args = {
      where: { tenantId_platformId: { tenantId: T_JAVIER, platformId: PF_PC } },
      update: { enabled: false },
      create: { tenantId: T_JAVIER, platformId: PF_PC },
    };
    const first = await fakeDb.tenantPlatform.upsert(args);
    expect(first.enabled).toBe(true);

    const second = await fakeDb.tenantPlatform.upsert(args);
    expect(second.enabled).toBe(false);
    expect(await fakeDb.tenantPlatform.count()).toBe(1);
  });

  it('findMany filtra por tenant', async () => {
    addFakeTenant({ id: T_JAVIER, name: 'Javier', slug: 'javier' });
    addFakeTenant({ id: T_OTRO, name: 'Otro', slug: 'otro' });
    addFakeTenantPlatform({ tenantId: T_JAVIER, platformId: PF_PC });
    addFakeTenantPlatform({ tenantId: T_JAVIER, platformId: PF_PS4 });
    addFakeTenantPlatform({ tenantId: T_OTRO, platformId: PF_PC });

    const rows = await fakeDb.tenantPlatform.findMany({ where: { tenantId: T_JAVIER } });
    expect(rows.map((row) => row.platformId).sort()).toEqual([PF_PC, PF_PS4].sort());
    expect(await fakeDb.tenantPlatform.count()).toBe(3);
  });

  it('findUnique por clave compuesta devuelve la fila', async () => {
    addFakeTenantPlatform({ tenantId: T_JAVIER, platformId: PF_PC });
    const row = await fakeDb.tenantPlatform.findUnique({
      where: { tenantId_platformId: { tenantId: T_JAVIER, platformId: PF_PC } },
    });
    expect(row?.platformId).toBe(PF_PC);
    const missing = await fakeDb.tenantPlatform.findUnique({
      where: { tenantId_platformId: { tenantId: T_OTRO, platformId: PF_PC } },
    });
    expect(missing).toBeNull();
  });
});

describe('TenantGame columnas nuevas (platformId, clearedFields)', () => {
  it('persiste la plataforma y clearedFields al crear', async () => {
    addFakeTenant({ id: T_JAVIER, name: 'Javier', slug: 'javier' });
    addFakePlatform({ id: PF_PC, tenantId: null, name: 'PC', slug: 'pc' });

    const game = addFakeTenantGame({
      id: '77777777-7777-4777-8777-777777777777',
      tenantId: T_JAVIER,
      title: 'Oferta PC',
      slug: 'oferta-pc',
      origin: 'BIBLIOTECA',
      platformId: PF_PC,
      clearedFields: ['price', 'description'],
    });

    const row = await fakeDb.tenantGame.findUnique({ where: { id: game.id } });
    expect(row?.platformId).toBe(PF_PC);
    expect(row?.clearedFields).toEqual(['price', 'description']);
  });

  it('los valores por defecto son null (herencia y nada borrado)', () => {
    const game = addFakeTenantGame({
      id: '88888888-8888-4888-8888-888888888888',
      tenantId: T_JAVIER,
      title: 'Sin heredar',
      slug: 'sin-heredar',
    });
    expect(game.platformId).toBeNull();
    expect(game.clearedFields).toBeNull();
  });

  it('actualiza clearedFields a lista vacía', async () => {
    const game = addFakeTenantGame({
      id: '99999999-9999-4999-8999-999999999999',
      tenantId: T_JAVIER,
      title: 'Editada',
      slug: 'editada',
      clearedFields: ['price'],
    });

    const updated = await fakeDb.tenantGame.update({
      where: { id: game.id },
      data: { clearedFields: [] },
    });
    expect(updated.clearedFields).toEqual([]);

    const cleared = await fakeDb.tenantGame.update({
      where: { id: game.id },
      data: { platformId: null, clearedFields: null },
    });
    expect(cleared.platformId).toBeNull();
    expect(cleared.clearedFields).toBeNull();
  });
});
