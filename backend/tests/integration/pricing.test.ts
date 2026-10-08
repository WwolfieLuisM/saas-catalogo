import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signAccessToken } from '../../src/modules/auth/auth.tokens.js';
import type { FakePricingRule, FakeTenantGame } from '../helpers/fakeDb.js';
import {
  addFakePricingRule,
  addFakeTenant,
  addFakeTenantGame,
  addFakeUser,
  resetFakeDb,
  state,
} from '../helpers/fakeDb.js';

vi.mock('../../src/config/database.js', async () => {
  const { fakeDb } = await import('../helpers/fakeDb.js');
  return { getPrisma: () => fakeDb, closePrisma: async () => undefined };
});

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

interface RuleDto {
  id: string;
  tenantId: string;
  minSize: number;
  maxSize: number | null;
  price: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PriceChange {
  id: string;
  title: string;
  slug: string;
  sizeGb: number;
  priceFrom: number | null;
  priceTo: number;
}

interface UncoveredGame {
  id: string;
  title: string;
  slug: string;
  sizeGb: number;
}

interface PreviewDto {
  rulesActive: number;
  changes: PriceChange[];
  changeCount: number;
  unchangedCount: number;
  uncovered: UncoveredGame[];
  uncoveredCount: number;
  manualCount: number;
  totalGames: number;
}

interface ApplyDto {
  applied: number;
  version: number;
}

const PRICING = '/api/v1/admin/pricing';
const T_JAVIER = '11111111-1111-4111-8111-111111111111';
const T_OTRO = '22222222-2222-4222-8222-222222222222';

let server: Server;
let baseUrl: string;
let superToken: string;
let adminToken: string;

async function api<T = Record<string, unknown>>(
  path: string,
  init: RequestInit = {},
  token?: string,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  const body = (await response.json()) as ApiBody<T>;

  return { status: response.status, body };
}

function seedRule(overrides: Partial<FakePricingRule> & { minSize: number }): FakePricingRule {
  return addFakePricingRule({
    id: randomUUID(),
    tenantId: T_JAVIER,
    price: 40,
    ...overrides,
  });
}

function seedGame(overrides: Partial<FakeTenantGame> = {}): FakeTenantGame {
  return addFakeTenantGame({
    id: randomUUID(),
    tenantId: T_JAVIER,
    title: 'Juego Precio',
    slug: `precio-${randomUUID().slice(0, 8)}`,
    ...overrides,
  });
}

function rulesInStore(): FakePricingRule[] {
  return [...state.pricingRules.values()];
}

function catalogVersion(): number | undefined {
  return [...state.catalogMetadata.values()][0]?.version;
}

function auditRow(action: string, entity = 'PricingRule') {
  return [...state.auditLogs.values()].find(
    (row) => row.action === action && row.entity === entity,
  );
}

beforeAll(async () => {
  const { createApp } = await import('../../src/app.js');
  server = createApp().listen(0);
  await new Promise<void>((resolve) => {
    server.once('listening', () => resolve());
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  superToken = await signAccessToken({ id: 'u-super', role: 'SUPER_ADMIN', tenantId: null });
  adminToken = await signAccessToken({ id: 'u-admin', role: 'ADMIN', tenantId: T_JAVIER });
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetFakeDb();
  addFakeUser({ id: 'u-super', username: 'root', role: 'SUPER_ADMIN', tenantId: null });
  addFakeUser({ id: 'u-admin', username: 'javier-admin', role: 'ADMIN', tenantId: T_JAVIER });
  addFakeTenant({ id: T_JAVIER, name: 'Javier', slug: 'javier' });
  addFakeTenant({ id: T_OTRO, name: 'Otro', slug: 'otro' });
});

describe('pricing: autenticación', () => {
  it('devuelve 401 en los endpoints sin token', async () => {
    const ruleId = randomUUID();
    const checks = [
      { path: `${PRICING}/rules`, init: { method: 'GET' } },
      { path: `${PRICING}/rules`, init: { method: 'POST', body: '{}' } },
      { path: `${PRICING}/rules/${ruleId}`, init: { method: 'PATCH', body: '{}' } },
      { path: `${PRICING}/rules/${ruleId}`, init: { method: 'DELETE' } },
      { path: `${PRICING}/preview`, init: { method: 'POST', body: '{}' } },
      { path: `${PRICING}/apply`, init: { method: 'POST', body: '{}' } },
    ];

    for (const check of checks) {
      const { status, body } = await api(check.path, check.init);
      expect(status).toBe(401);
      expect(body.error?.code).toBe('UNAUTHENTICATED');
    }
  });
});

describe('pricing: reglas CRUD', () => {
  it('lista las reglas del tenant ordenadas por minSize (ADMIN)', async () => {
    seedRule({ minSize: 50.01, maxSize: 100, price: 70 });
    seedRule({ minSize: 100.01, maxSize: null, price: 100 });
    seedRule({ minSize: 1, maxSize: 10, price: 40 });
    seedRule({ tenantId: T_OTRO, minSize: 1, maxSize: 10, price: 999 });

    const { status, body } = await api<RuleDto[]>(`${PRICING}/rules`, {}, adminToken);

    expect(status).toBe(200);
    const rows = body.data as RuleDto[];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.minSize)).toEqual([1, 50.01, 100.01]);
    expect(rows[0]?.price).toBe(40);
    expect(rows[2]?.maxSize).toBeNull();
  });

  it('devuelve 400 si SUPER_ADMIN no envía tenantId en la colección', async () => {
    const { status, body } = await api(`${PRICING}/rules`, {}, superToken);

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('permite a SUPER_ADMIN listar reglas de otro tenant con tenantId', async () => {
    seedRule({ tenantId: T_OTRO, minSize: 5, maxSize: null, price: 30 });

    const { status, body } = await api<RuleDto[]>(
      `${PRICING}/rules?tenantId=${T_OTRO}`,
      {},
      superToken,
    );

    expect(status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect((body.data as RuleDto[])[0]?.price).toBe(30);
  });

  it('devuelve 403 si ADMIN pide reglas de otro tenant', async () => {
    const { status, body } = await api(`${PRICING}/rules?tenantId=${T_OTRO}`, {}, adminToken);

    expect(status).toBe(403);
    expect(body.error?.code).toBe('FORBIDDEN');
  });

  it('crea una regla y audita PRICE_RULE_CREATED', async () => {
    const input = { minSize: 1, maxSize: 10, price: 40, active: true };
    const { status, body } = await api<RuleDto>(
      `${PRICING}/rules`,
      { method: 'POST', body: JSON.stringify(input) },
      adminToken,
    );

    expect(status).toBe(201);
    expect(body.data).toMatchObject({
      tenantId: T_JAVIER,
      minSize: 1,
      maxSize: 10,
      price: 40,
      active: true,
    });

    const log = auditRow('PRICE_RULE_CREATED');
    expect(log).toBeDefined();
    expect(log?.tenantId).toBe(T_JAVIER);
    expect(log?.entityId).toBe((body.data as RuleDto).id);
    expect(log?.metadata).toMatchObject({ minSize: 1, maxSize: 10, price: 40 });
  });

  it('crea una regla contigua sin solape (10.01 arranca donde termina 10)', async () => {
    seedRule({ minSize: 1, maxSize: 10, price: 40 });

    const { status } = await api(
      `${PRICING}/rules`,
      { method: 'POST', body: JSON.stringify({ minSize: 10.01, maxSize: 50, price: 50 }) },
      adminToken,
    );

    expect(status).toBe(201);
    expect(rulesInStore()).toHaveLength(2);
  });

  it('devuelve 422 PRICE_RULE_OVERLAP si los rangos activos se solapan', async () => {
    seedRule({ minSize: 1, maxSize: 10, price: 40 });

    const { status, body } = await api(
      `${PRICING}/rules`,
      { method: 'POST', body: JSON.stringify({ minSize: 5, maxSize: 20, price: 60 }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('PRICE_RULE_OVERLAP');
    expect(body.error?.details).toMatchObject({ conflict: expect.any(Object) });
    expect(rulesInStore()).toHaveLength(1);
  });

  it('devuelve 422 PRICE_RULE_UNBOUNDED_ORDER si una regla sin tope va antes que otras', async () => {
    seedRule({ minSize: 5, maxSize: 10, price: 50 });

    const { status, body } = await api(
      `${PRICING}/rules`,
      { method: 'POST', body: JSON.stringify({ minSize: 1, maxSize: null, price: 30 }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('PRICE_RULE_UNBOUNDED_ORDER');
    expect(rulesInStore()).toHaveLength(1);
  });

  it('permite una única regla sin límite superior como única regla', async () => {
    const { status } = await api(
      `${PRICING}/rules`,
      { method: 'POST', body: JSON.stringify({ minSize: 0, maxSize: null, price: 20 }) },
      adminToken,
    );

    expect(status).toBe(201);
  });

  it('devuelve 400 si maxSize no es mayor que minSize', async () => {
    const { status, body } = await api(
      `${PRICING}/rules`,
      { method: 'POST', body: JSON.stringify({ minSize: 10, maxSize: 10, price: 40 }) },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('devuelve 400 si minSize o price es negativo', async () => {
    const negativeMin = await api(
      `${PRICING}/rules`,
      { method: 'POST', body: JSON.stringify({ minSize: -1, price: 40 }) },
      adminToken,
    );
    expect(negativeMin.status).toBe(400);

    const negativePrice = await api(
      `${PRICING}/rules`,
      { method: 'POST', body: JSON.stringify({ minSize: 1, price: -5 }) },
      adminToken,
    );
    expect(negativePrice.status).toBe(400);
  });

  it('edita una regla y audita PRICE_RULE_UPDATED con los campos tocados', async () => {
    const rule = seedRule({ minSize: 1, maxSize: 10, price: 40 });

    const { status, body } = await api<RuleDto>(
      `${PRICING}/rules/${rule.id}`,
      { method: 'PATCH', body: JSON.stringify({ price: 45, maxSize: 12 }) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toMatchObject({ price: 45, maxSize: 12, minSize: 1, active: true });

    const log = auditRow('PRICE_RULE_UPDATED');
    expect(log?.metadata).toMatchObject({ fields: ['maxSize', 'price'] });
    expect(log?.entityId).toBe(rule.id);
  });

  it('desactivar una regla excluye su rango de la validación de solapes', async () => {
    const rule = seedRule({ minSize: 1, maxSize: 10, price: 40 });
    seedRule({ minSize: 10.01, maxSize: 50, price: 50 });

    const toggle = await api(
      `${PRICING}/rules/${rule.id}`,
      { method: 'PATCH', body: JSON.stringify({ active: false }) },
      adminToken,
    );
    expect(toggle.status).toBe(200);

    const { status } = await api(
      `${PRICING}/rules`,
      { method: 'POST', body: JSON.stringify({ minSize: 5, maxSize: 10, price: 35 }) },
      adminToken,
    );

    expect(status).toBe(201);
    expect(rulesInStore()).toHaveLength(3);
  });

  it('devuelve 422 PRICE_RULE_INVALID si maxSize queda menor o igual que minSize existente', async () => {
    seedRule({ minSize: 1, maxSize: 10, price: 40 });
    const other = seedRule({ minSize: 10.01, maxSize: 50, price: 50 });

    const { status, body } = await api(
      `${PRICING}/rules/${other.id}`,
      { method: 'PATCH', body: JSON.stringify({ maxSize: 5 }) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('PRICE_RULE_INVALID');
  });

  it('devuelve 404 si la regla no existe', async () => {
    const { status, body } = await api(
      `${PRICING}/rules/${randomUUID()}`,
      { method: 'PATCH', body: JSON.stringify({ price: 10 }) },
      adminToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('PRICE_RULE_NOT_FOUND');
  });

  it('devuelve 404 si ADMIN toca una regla de otro tenant', async () => {
    const foreign = seedRule({ tenantId: T_OTRO, minSize: 1, maxSize: 10, price: 40 });

    const { status, body } = await api(
      `${PRICING}/rules/${foreign.id}`,
      { method: 'PATCH', body: JSON.stringify({ price: 10 }) },
      adminToken,
    );

    expect(status).toBe(404);
    expect(body.error?.code).toBe('PRICE_RULE_NOT_FOUND');
  });

  it('devuelve 400 si PATCH no envía campos', async () => {
    const rule = seedRule({ minSize: 1, maxSize: 10, price: 40 });

    const { status, body } = await api(
      `${PRICING}/rules/${rule.id}`,
      { method: 'PATCH', body: JSON.stringify({}) },
      adminToken,
    );

    expect(status).toBe(400);
    expect(body.error?.code).toBe('VALIDATION_ERROR');
  });

  it('elimina una regla, audita PRICE_RULE_DELETED y la saca de la lista', async () => {
    const keep = seedRule({ minSize: 1, maxSize: 10, price: 40 });
    const doomed = seedRule({ minSize: 10.01, maxSize: 50, price: 50 });

    const del = await api<{ id: string; deleted: boolean }>(
      `${PRICING}/rules/${doomed.id}`,
      { method: 'DELETE' },
      adminToken,
    );
    expect(del.status).toBe(200);
    expect(del.body.data).toEqual({ id: doomed.id, deleted: true });

    const log = auditRow('PRICE_RULE_DELETED');
    expect(log?.entityId).toBe(doomed.id);

    const list = await api<RuleDto[]>(`${PRICING}/rules`, {}, adminToken);
    expect(list.body.data).toHaveLength(1);
    expect((list.body.data as RuleDto[])[0]?.id).toBe(keep.id);
  });

  it('devuelve 404 al eliminar una regla inexistente o ajena', async () => {
    const missing = await api(`${PRICING}/rules/${randomUUID()}`, { method: 'DELETE' }, adminToken);
    expect(missing.status).toBe(404);

    const foreign = seedRule({ tenantId: T_OTRO, minSize: 1, maxSize: 10, price: 40 });
    const cross = await api(`${PRICING}/rules/${foreign.id}`, { method: 'DELETE' }, adminToken);
    expect(cross.status).toBe(404);
  });
});

describe('pricing: preview', () => {
  function seedScenario() {
    seedRule({ minSize: 1, maxSize: 10, price: 40 });
    seedRule({ minSize: 10.01, maxSize: 50, price: 50 });

    seedGame({
      title: 'Cambia 1',
      slug: 'cambia-1',
      sizeValue: 5,
      sizeUnit: 'GB',
      priceMode: 'RULE',
      price: 99,
    });
    seedGame({
      title: 'Cambia 2',
      slug: 'cambia-2',
      sizeValue: 20,
      sizeUnit: 'GB',
      priceMode: 'RULE',
      price: 40,
    });
    seedGame({
      title: 'Igual',
      slug: 'igual',
      sizeValue: 30,
      sizeUnit: 'GB',
      priceMode: 'RULE',
      price: 50,
    });
    seedGame({
      title: 'Sin precio',
      slug: 'sin-precio',
      sizeValue: 1500,
      sizeUnit: 'MB',
      priceMode: 'RULE',
      price: null,
    });
    seedGame({
      title: 'Sin regla',
      slug: 'sin-regla',
      sizeValue: 200,
      sizeUnit: 'GB',
      priceMode: 'RULE',
      price: null,
    });
    seedGame({
      title: 'Manual',
      slug: 'manual',
      sizeValue: 5,
      sizeUnit: 'GB',
      priceMode: 'MANUAL',
      price: 777,
    });
  }

  it('devuelve cambios, iguales, sin cobertura y manuales sin tocar nada', async () => {
    seedScenario();

    const { status, body } = await api<PreviewDto>(
      `${PRICING}/preview`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );

    expect(status).toBe(200);
    const data = body.data as PreviewDto;
    expect(data.rulesActive).toBe(2);
    expect(data.changeCount).toBe(3);
    expect(data.unchangedCount).toBe(1);
    expect(data.uncoveredCount).toBe(1);
    expect(data.manualCount).toBe(1);
    expect(data.totalGames).toBe(6);

    const change = data.changes.find((item) => item.slug === 'cambia-1');
    expect(change).toMatchObject({ priceFrom: 99, priceTo: 40, sizeGb: 5 });

    expect(data.uncovered[0]).toMatchObject({ slug: 'sin-regla', sizeGb: 200 });

    const prices = [...state.tenantGames.values()].map((game) => game.price);
    expect(prices).toContain(99);
  });

  it('convierte MB y TB a GB en el cálculo (límites inclusivos)', async () => {
    seedRule({ minSize: 1, maxSize: 10, price: 40 });
    seedRule({ minSize: 10.01, maxSize: 50, price: 50 });
    seedGame({
      title: 'MB',
      slug: 'mb-game',
      sizeValue: 1200,
      sizeUnit: 'MB',
      priceMode: 'RULE',
      price: null,
    });
    seedGame({
      title: 'TB',
      slug: 'tb-game',
      sizeValue: 0.05,
      sizeUnit: 'TB',
      priceMode: 'RULE',
      price: null,
    });

    const { body } = await api<PreviewDto>(
      `${PRICING}/preview`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );

    const data = body.data as PreviewDto;
    const mbGame = data.changes.find((item) => item.slug === 'mb-game');
    const tbGame = data.changes.find((item) => item.slug === 'tb-game');
    expect(mbGame).toMatchObject({ sizeGb: 1.2, priceTo: 40 });
    expect(tbGame).toMatchObject({ sizeGb: 50, priceTo: 50 });
  });

  it('devuelve 422 si las reglas guardadas están solapadas (autoridad del backend)', async () => {
    seedRule({ minSize: 1, maxSize: 10, price: 40 });
    seedRule({ minSize: 5, maxSize: 20, price: 60 });
    seedGame({ priceMode: 'RULE', price: 10 });

    const { status, body } = await api(
      `${PRICING}/preview`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );

    expect(status).toBe(422);
    expect(body.error?.code).toBe('PRICE_RULE_OVERLAP');
  });

  it('aplica contadores solo sobre reglas activas', async () => {
    seedRule({ minSize: 1, maxSize: 10, price: 40, active: false });
    seedRule({ minSize: 10.01, maxSize: 50, price: 50, active: true });
    seedGame({
      title: 'Cubrir',
      slug: 'cubrir',
      sizeValue: 5,
      sizeUnit: 'GB',
      priceMode: 'RULE',
      price: 10,
    });

    const { body } = await api<PreviewDto>(
      `${PRICING}/preview`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );

    const data = body.data as PreviewDto;
    expect(data.rulesActive).toBe(1);
    expect(data.uncoveredCount).toBe(1);
    expect(data.changes).toHaveLength(0);
  });

  it('devuelve 400 si SUPER_ADMIN no envía tenantId y 403 si ADMIN pide otro', async () => {
    const superCall = await api(
      `${PRICING}/preview`,
      { method: 'POST', body: JSON.stringify({}) },
      superToken,
    );
    expect(superCall.status).toBe(400);
    expect(superCall.body.error?.code).toBe('VALIDATION_ERROR');

    const adminCall = await api(
      `${PRICING}/preview`,
      { method: 'POST', body: JSON.stringify({ tenantId: T_OTRO }) },
      adminToken,
    );
    expect(adminCall.status).toBe(403);
  });
});

describe('pricing: apply', () => {
  function seedApplyScenario() {
    seedRule({ minSize: 1, maxSize: 10, price: 40 });
    seedRule({ minSize: 10.01, maxSize: 50, price: 50 });
    seedGame({
      title: 'Cambio',
      slug: 'cambio',
      sizeValue: 5,
      sizeUnit: 'GB',
      priceMode: 'RULE',
      price: 99,
    });
    seedGame({
      title: 'Manual',
      slug: 'manual',
      sizeValue: 5,
      sizeUnit: 'GB',
      priceMode: 'MANUAL',
      price: 777,
    });
    seedGame({
      title: 'Sin regla',
      slug: 'sin-regla',
      sizeValue: 200,
      sizeUnit: 'GB',
      priceMode: 'RULE',
      price: null,
    });
  }

  it('actualiza precios, audita PRICES_APPLIED y crea la versión 1 del catálogo', async () => {
    seedApplyScenario();

    const { status, body } = await api<ApplyDto>(
      `${PRICING}/apply`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );

    expect(status).toBe(200);
    expect(body.data).toEqual({ applied: 1, version: 1 });

    const rows = [...state.tenantGames.values()];
    const cambio = rows.find((game) => game.slug === 'cambio');
    expect(cambio?.price).toBe(40);
    const manual = rows.find((game) => game.slug === 'manual');
    expect(manual?.price).toBe(777);
    const sinRegla = rows.find((game) => game.slug === 'sin-regla');
    expect(sinRegla?.price).toBeNull();

    expect(catalogVersion()).toBe(1);

    const log = auditRow('PRICES_APPLIED', 'TenantGame');
    expect(log).toBeDefined();
    expect(log?.tenantId).toBe(T_JAVIER);
    expect(log?.metadata).toMatchObject({ count: 1, version: 1 });
  });

  it('reaplicar sin cambios devuelve applied 0 y no duplica versión ni auditoría', async () => {
    seedApplyScenario();

    await api(`${PRICING}/apply`, { method: 'POST', body: '{}' }, adminToken);
    const second = await api<ApplyDto>(
      `${PRICING}/apply`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );

    expect(second.body.data).toEqual({ applied: 0, version: 1 });

    const appliedLogs = [...state.auditLogs.values()].filter(
      (row) => row.action === 'PRICES_APPLIED',
    );
    expect(appliedLogs).toHaveLength(1);
    expect(catalogVersion()).toBe(1);
  });

  it('editar una regla y volver a aplicar incrementa la versión a 2', async () => {
    const rule = seedRule({ minSize: 1, maxSize: 10, price: 40 });
    seedGame({
      title: 'Cambio',
      slug: 'cambio',
      sizeValue: 5,
      sizeUnit: 'GB',
      priceMode: 'RULE',
      price: 40,
    });

    const first = await api<ApplyDto>(
      `${PRICING}/apply`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );
    expect(first.body.data).toEqual({ applied: 0, version: 0 });

    await api(
      `${PRICING}/rules/${rule.id}`,
      { method: 'PATCH', body: JSON.stringify({ price: 55 }) },
      adminToken,
    );

    const second = await api<ApplyDto>(
      `${PRICING}/apply`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );

    expect(second.body.data).toEqual({ applied: 1, version: 1 });
    const game = [...state.tenantGames.values()].find((row) => row.slug === 'cambio');
    expect(game?.price).toBe(55);
    expect(catalogVersion()).toBe(1);
  });

  it('la versión crece de 1 a 2 entre aplicaciones con cambios', async () => {
    const rule = seedRule({ minSize: 1, maxSize: 10, price: 40 });
    seedGame({ sizeValue: 5, sizeUnit: 'GB', priceMode: 'RULE', price: 99 });

    const first = await api<ApplyDto>(
      `${PRICING}/apply`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );
    expect(first.body.data).toEqual({ applied: 1, version: 1 });

    await api(
      `${PRICING}/rules/${rule.id}`,
      { method: 'PATCH', body: JSON.stringify({ price: 60 }) },
      adminToken,
    );

    const second = await api<ApplyDto>(
      `${PRICING}/apply`,
      { method: 'POST', body: JSON.stringify({}) },
      adminToken,
    );
    expect(second.body.data).toEqual({ applied: 1, version: 2 });
    expect(catalogVersion()).toBe(2);
  });

  it('devuelve 400 si SUPER_ADMIN no envía tenantId y 403 si ADMIN pide otro', async () => {
    const superCall = await api(
      `${PRICING}/apply`,
      { method: 'POST', body: JSON.stringify({}) },
      superToken,
    );
    expect(superCall.status).toBe(400);

    const adminCall = await api(
      `${PRICING}/apply`,
      { method: 'POST', body: JSON.stringify({ tenantId: T_OTRO }) },
      adminToken,
    );
    expect(adminCall.status).toBe(403);
    expect(adminCall.body.error?.code).toBe('FORBIDDEN');
  });
});
