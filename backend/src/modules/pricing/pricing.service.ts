import { randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import type { AuthContext } from '../../middleware/auth.js';
import type { Prisma, PricingRule } from '../../generated/client.js';
import { AppError } from '../../utils/appError.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import { planCatalogBump } from '../catalog/catalog.service.js';
import { resolveTenantId } from '../games/games.service.js';
import type { CreatePricingRuleInput, UpdatePricingRuleInput } from './pricing.schemas.js';

interface RuleLike {
  id: string;
  minSize: number;
  maxSize: number | null;
  active: boolean;
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

export function sizeToGb(sizeValue: number, sizeUnit: 'MB' | 'GB' | 'TB'): number {
  if (sizeUnit === 'MB') return sizeValue / 1000;
  if (sizeUnit === 'TB') return sizeValue * 1000;
  return sizeValue;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculatePrice(sizeGb: number, rules: PricingRule[]): number | null {
  const ordered = rules.filter((rule) => rule.active).sort((a, b) => a.minSize - b.minSize);
  const match = ordered.find(
    (rule) => sizeGb >= rule.minSize && (rule.maxSize === null || sizeGb <= rule.maxSize),
  );
  return match ? Number(match.price) : null;
}

function validateRuleSet(rows: RuleLike[]): void {
  const active = rows.filter((row) => row.active).sort((a, b) => a.minSize - b.minSize);

  for (const row of active) {
    if (row.maxSize !== null && row.maxSize <= row.minSize) {
      throw new AppError(
        422,
        'PRICE_RULE_INVALID',
        'Rango de regla inválido: maxSize debe ser mayor que minSize',
        { ruleId: row.id },
      );
    }
  }

  for (const [index, current] of active.entries()) {
    if (current.maxSize === null && index < active.length - 1) {
      throw new AppError(
        422,
        'PRICE_RULE_UNBOUNDED_ORDER',
        'Hay una regla sin límite superior antes de otras',
        { ruleId: current.id },
      );
    }

    const next = active[index + 1];
    if (next && current.maxSize !== null && next.minSize <= current.maxSize) {
      throw new AppError(422, 'PRICE_RULE_OVERLAP', 'Los rangos de las reglas activas se solapan', {
        conflict: {
          a: current.id,
          b: next.id,
          aMax: current.maxSize,
          bMin: next.minSize,
        },
      });
    }
  }
}

function ruleDto(row: PricingRule) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    minSize: row.minSize,
    maxSize: row.maxSize,
    price: Number(row.price),
    active: row.active,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertRuleAccess(row: PricingRule, auth: AuthContext | null): void {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }
  if (auth.role === 'ADMIN' && row.tenantId !== auth.tenantId) {
    throw new AppError(404, 'PRICE_RULE_NOT_FOUND', 'Regla de precio no encontrada');
  }
}

async function findRule(id: string): Promise<PricingRule> {
  const prisma = getPrisma();
  const row = await prisma.pricingRule.findFirst({ where: { id } });
  if (!row) {
    throw new AppError(404, 'PRICE_RULE_NOT_FOUND', 'Regla de precio no encontrada');
  }
  return row;
}

export async function listRules(auth: AuthContext | null, requestedTenantId?: string) {
  const tenantId = resolveTenantId(auth, requestedTenantId);
  const prisma = getPrisma();
  const rows = await prisma.pricingRule.findMany({
    where: { tenantId },
    orderBy: [{ minSize: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(ruleDto);
}

export async function createRule(
  input: CreatePricingRuleInput,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  const tenantId = resolveTenantId(auth, input.tenantId);
  const prisma = getPrisma();
  const existing = await prisma.pricingRule.findMany({ where: { tenantId } });

  const candidate: RuleLike = {
    id: randomUUID(),
    minSize: input.minSize,
    maxSize: input.maxSize ?? null,
    active: input.active,
  };
  validateRuleSet([...existing, candidate]);

  const [created] = (await prisma.$transaction([
    prisma.pricingRule.create({
      data: {
        id: candidate.id,
        tenantId,
        minSize: candidate.minSize,
        maxSize: candidate.maxSize,
        price: input.price,
        active: candidate.active,
      },
    }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'PRICE_RULE_CREATED',
        entity: 'PricingRule',
        entityId: candidate.id,
        tenantId,
        metadata: {
          minSize: candidate.minSize,
          maxSize: candidate.maxSize,
          price: input.price,
          active: candidate.active,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ])) as [PricingRule, ...unknown[]];

  return ruleDto(created);
}

export async function updateRule(
  id: string,
  input: UpdatePricingRuleInput,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  const row = await findRule(id);
  assertRuleAccess(row, auth);
  const prisma = getPrisma();

  const merged: RuleLike & { price: number } = {
    id: row.id,
    minSize: input.minSize ?? row.minSize,
    maxSize: input.maxSize === undefined ? row.maxSize : input.maxSize,
    active: input.active ?? row.active,
    price: input.price ?? Number(row.price),
  };

  if (merged.maxSize !== null && merged.maxSize <= merged.minSize) {
    throw new AppError(
      422,
      'PRICE_RULE_INVALID',
      'Rango de regla inválido: maxSize debe ser mayor que minSize',
      { ruleId: row.id },
    );
  }

  const tenantRules = await prisma.pricingRule.findMany({ where: { tenantId: row.tenantId } });
  validateRuleSet([...tenantRules.filter((rule) => rule.id !== row.id), merged]);

  const data: {
    minSize?: number;
    maxSize?: number | null;
    price?: number;
    active?: boolean;
  } = {};
  if (input.minSize !== undefined) data.minSize = input.minSize;
  if (input.maxSize !== undefined) data.maxSize = input.maxSize;
  if (input.price !== undefined) data.price = input.price;
  if (input.active !== undefined) data.active = input.active;

  const [updated] = (await prisma.$transaction([
    prisma.pricingRule.update({ where: { id: row.id }, data }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'PRICE_RULE_UPDATED',
        entity: 'PricingRule',
        entityId: row.id,
        tenantId: row.tenantId,
        metadata: {
          fields: Object.keys(data),
          minSize: merged.minSize,
          maxSize: merged.maxSize,
          price: Number(merged.price),
          active: merged.active,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ])) as [PricingRule, ...unknown[]];

  return ruleDto(updated);
}

export async function deleteRule(id: string, auth: AuthContext | null, meta: RequestMeta) {
  const row = await findRule(id);
  assertRuleAccess(row, auth);
  const prisma = getPrisma();

  await prisma.$transaction([
    prisma.pricingRule.delete({ where: { id: row.id } }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'PRICE_RULE_DELETED',
        entity: 'PricingRule',
        entityId: row.id,
        tenantId: row.tenantId,
        metadata: {
          minSize: row.minSize,
          maxSize: row.maxSize,
          price: Number(row.price),
          active: row.active,
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ]);

  return { id: row.id, deleted: true };
}

interface PriceDiff {
  rules: PricingRule[];
  changes: PriceChange[];
  uncovered: UncoveredGame[];
  unchanged: number;
  manual: number;
  total: number;
}

async function computeDiff(tenantId: string): Promise<PriceDiff> {
  const prisma = getPrisma();
  const [rules, games] = await Promise.all([
    prisma.pricingRule.findMany({ where: { tenantId } }),
    prisma.tenantGame.findMany({ where: { tenantId, deletedAt: null } }),
  ]);

  validateRuleSet(rules);

  const changes: PriceChange[] = [];
  const uncovered: UncoveredGame[] = [];
  let unchanged = 0;
  let manual = 0;

  for (const game of games) {
    if (game.priceMode === 'MANUAL') {
      manual += 1;
      continue;
    }

    const sizeGb = sizeToGb(game.sizeValue, game.sizeUnit);
    const priceTo = calculatePrice(sizeGb, rules);

    if (priceTo === null) {
      uncovered.push({
        id: game.id,
        title: game.title,
        slug: game.slug,
        sizeGb: round2(sizeGb),
      });
      continue;
    }

    const priceFrom = game.price === null ? null : Number(game.price);
    if (priceFrom === priceTo) {
      unchanged += 1;
    } else {
      changes.push({
        id: game.id,
        title: game.title,
        slug: game.slug,
        sizeGb: round2(sizeGb),
        priceFrom,
        priceTo,
      });
    }
  }

  return { rules, changes, uncovered, unchanged, manual, total: games.length };
}

export async function previewPricing(auth: AuthContext | null, requestedTenantId?: string) {
  const tenantId = resolveTenantId(auth, requestedTenantId);
  const diff = await computeDiff(tenantId);

  return {
    rulesActive: diff.rules.filter((rule) => rule.active).length,
    changes: diff.changes,
    changeCount: diff.changes.length,
    unchangedCount: diff.unchanged,
    uncovered: diff.uncovered,
    uncoveredCount: diff.uncovered.length,
    manualCount: diff.manual,
    totalGames: diff.total,
  };
}

export async function applyPricing(
  auth: AuthContext | null,
  requestedTenantId: string | undefined,
  meta: RequestMeta,
) {
  const tenantId = resolveTenantId(auth, requestedTenantId);
  const prisma = getPrisma();
  const diff = await computeDiff(tenantId);

  const metadataRow = await prisma.catalogMetadata.findFirst({ where: { tenantId } });
  const currentVersion = metadataRow?.version ?? 0;

  if (diff.changes.length === 0) {
    return { applied: 0, version: currentVersion };
  }

  const nextVersion = currentVersion + 1;
  const ops: Prisma.PrismaPromise<unknown>[] = diff.changes.map((change) =>
    prisma.tenantGame.update({
      where: { id: change.id },
      data: { price: change.priceTo, updatedBy: auth?.id ?? null },
    }),
  );

  ops.push(
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'PRICES_APPLIED',
        entity: 'TenantGame',
        tenantId,
        metadata: { count: diff.changes.length, version: nextVersion },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  );

  ops.push((await planCatalogBump(tenantId)).op);

  await prisma.$transaction(ops);

  return { applied: diff.changes.length, version: nextVersion };
}
