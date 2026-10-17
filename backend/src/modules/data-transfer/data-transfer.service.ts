import { createHash, randomUUID } from 'node:crypto';
import { getPrisma } from '../../config/database.js';
import type { Prisma, PrismaClient } from '../../generated/client.js';
import type { AuthContext } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import { describeMediaHosting } from '../../utils/mediaHosting.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import { createBackup } from '../backups/backups.service.js';
import { planCatalogBump } from '../catalog/catalog.service.js';
import { jsonValue, slugSchema } from '../games/game.shared.js';
import { resolveTenantId } from '../games/games.service.js';
import type {
  CatalogOffer,
  ExportQuery,
  ImportBackupInput,
  RunImportInput,
  ValidateImportInput,
} from './data-transfer.schemas.js';
import { CATALOG_SCHEMA, catalogOfferSchema } from './data-transfer.schemas.js';

const MEDIA_MANIFEST_SCHEMA = 'luismi-platform/media-manifest@1';

type DbClient = PrismaClient | Prisma.TransactionClient;

interface ExportResult {
  payload: Record<string, unknown>;
  filename: string;
}

interface PreparedCreate {
  index: number;
  baseGameId: string;
  platformId: string;
  platformSlug: string;
  title: string | null;
  slug: string;
  description: string | null;
  priceMode: 'RULE' | 'MANUAL';
  price: number | null;
  availability: boolean;
  sizeValue: number | null;
  sizeUnit: 'MB' | 'GB' | 'TB' | null;
  releaseYear: number | null;
  origin: 'BIBLIOTECA' | 'PERSONALIZADO';
  minimumRequirements: unknown;
  recommendedRequirements: unknown;
  clearedFields: string[];
}

interface PreparedUpdate {
  index: number;
  id: string;
  title: string | null;
  slug: string;
  platform: string;
  fields: string[];
  patch: Prisma.TenantGameUpdateInput;
}

interface PreparedDelete {
  id: string;
  title: string | null;
  slug: string;
}

interface ParsedOffer {
  index: number;
  data: CatalogOffer;
  slug: string;
}

interface ImportChanges {
  create: PreparedCreate[];
  update: PreparedUpdate[];
  delete: PreparedDelete[];
  unchanged: number;
}

interface ImportAnalysis {
  errors: string[];
  warnings: string[];
  changes: ImportChanges | null;
}

interface RawIssue {
  code?: string;
  path?: readonly PropertyKey[];
  message?: string;
  keys?: readonly string[];
}

function formatIssue(issue: RawIssue): string {
  if (issue.code === 'unrecognized_keys' && issue.keys) {
    return `campos no reconocidos: ${issue.keys.join(', ')}`;
  }
  const path = (issue.path ?? []).map(String).join('.');
  return `${path ? `${path}: ` : ''}${issue.message ?? 'valor inválido'}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function canonicalJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = canonicalJson(source[key]);
    return out;
  }
  return value;
}

async function computeFingerprint(tenantId: string, client: DbClient): Promise<string> {
  const [meta, rows] = await Promise.all([
    client.catalogMetadata.findFirst({ where: { tenantId } }),
    client.tenantGame.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
  ]);

  const payload = JSON.stringify([
    meta?.version ?? 0,
    rows.map((row) => [
      row.id,
      row.updatedAt.getTime(),
      row.deletedAt ? row.deletedAt.getTime() : null,
    ]),
  ]);

  return createHash('sha256').update(payload).digest('hex');
}

const OVERRIDE_FIELDS = [
  'title',
  'description',
  'sizeValue',
  'sizeUnit',
  'releaseYear',
  'minimumRequirements',
  'recommendedRequirements',
] as const;

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalJson(left ?? null)) === JSON.stringify(canonicalJson(right ?? null));
}

function absent(value: unknown): boolean {
  return value === null || value === undefined;
}

function deriveSlug(offer: Pick<CatalogOffer, 'baseGameSlug' | 'platformSlug' | 'slug'>): string {
  return offer.slug ?? `${offer.baseGameSlug}-${offer.platformSlug}`;
}

function analyzeOffers(
  offers: unknown[],
  warnings: string[],
): { errors: string[]; parsed: ParsedOffer[] } {
  const errors: string[] = [];
  const parsed: ParsedOffer[] = [];

  offers.forEach((raw, position) => {
    const prefix = `Oferta ${position + 1}: `;
    const result = catalogOfferSchema.safeParse(raw);

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(prefix + formatIssue(issue));
      }
      return;
    }

    const data = result.data;
    const slug = deriveSlug(data);

    const validSlug = slugSchema.safeParse(slug);
    if (!validSlug.success) {
      errors.push(
        `${prefix}el slug '${slug}' no es válido: usa un "slug" explícito de hasta 50 caracteres.`,
      );
      return;
    }

    if (absent(data.sizeValue) !== absent(data.sizeUnit)) {
      errors.push(`${prefix}sizeValue y sizeUnit van siempre en pareja.`);
      return;
    }

    parsed.push({ index: position, data, slug });
  });

  const seen = new Map<string, number>();

  for (const item of parsed) {
    const key = `${item.data.baseGameSlug}|${item.data.platformSlug}`;
    const previous = seen.get(key);
    if (previous !== undefined) {
      errors.push(
        `Oferta ${item.index + 1}: ya existe una oferta de '${item.data.baseGameSlug}' en '${item.data.platformSlug}' (oferta ${previous + 1}).`,
      );
    } else {
      seen.set(key, item.index);
    }
  }

  if (errors.length > 0) {
    warnings.push('Ninguna oferta se evaluó: el archivo tiene errores de formato.');
  }

  return { errors, parsed };
}

async function analyzeImport(tenantId: string, raw: unknown): Promise<ImportAnalysis> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError(
      400,
      'CATALOG_SCHEMA_UNSUPPORTED',
      `El archivo debe ser un objeto con "schema": "${CATALOG_SCHEMA}". Regenera el catálogo con el contrato nuevo: cada oferta es una entrada con una única "platformSlug".`,
    );
  }

  const rawSchema = (raw as { schema?: unknown }).schema;
  const declared = typeof rawSchema === 'string' ? rawSchema : null;
  const offers = (raw as { offers?: unknown }).offers;

  if (declared !== CATALOG_SCHEMA || !Array.isArray(offers)) {
    throw new AppError(
      400,
      'CATALOG_SCHEMA_UNSUPPORTED',
      `El archivo declara ${declared ? `"${declared}"` : 'sin "schema"'} y este importador solo admite "${CATALOG_SCHEMA}" con su lista "offers". Regenera el catálogo con el contrato nuevo: cada oferta es una entrada con una única "platformSlug".`,
    );
  }

  const entries = offers;
  const payloadObject = raw as Record<string, unknown>;

  if (payloadObject['tenantId'] !== undefined) {
    warnings.push(
      'El archivo incluye un tenantId. Se ignora: el servidor siempre usa el de tu sesión.',
    );
  }

  const structural = analyzeOffers(entries, warnings);
  errors.push(...structural.errors);
  const parsed = structural.parsed;

  if (errors.length > 0) {
    return { errors, warnings, changes: null };
  }

  const prisma = getPrisma();
  const baseGameSlugs = uniqueSorted(parsed.map((item) => item.data.baseGameSlug));
  const platformSlugs = uniqueSorted(parsed.map((item) => item.data.platformSlug));

  const [baseGames, platforms] = await Promise.all([
    baseGameSlugs.length
      ? prisma.baseGame.findMany({ where: { slug: { in: baseGameSlugs }, deletedAt: null } })
      : Promise.resolve([]),
    platformSlugs.length
      ? prisma.platform.findMany({
          where: { tenantId: null, slug: { in: platformSlugs }, deletedAt: null },
        })
      : Promise.resolve([]),
  ]);

  const baseGameBySlug = new Map(baseGames.map((row) => [row.slug, row]));
  const platformBySlug = new Map(platforms.map((row) => [row.slug, row]));

  const enabledPlatforms = new Set<string>();
  if (platforms.length) {
    const rows = await prisma.tenantPlatform.findMany({
      where: { tenantId, platformId: { in: platforms.map((row) => row.id) } },
    });
    for (const row of rows) {
      if (row.enabled) enabledPlatforms.add(row.platformId);
    }
  }

  for (const item of parsed) {
    const prefix = `Oferta ${item.index + 1}: `;
    const { baseGameSlug, platformSlug } = item.data;

    if (!baseGameBySlug.has(baseGameSlug)) {
      errors.push(`${prefix}'${baseGameSlug}' no existe en la biblioteca o está eliminado.`);
    }
    const platform = platformBySlug.get(platformSlug);
    if (!platform) {
      errors.push(`${prefix}'${platformSlug}' no existe en el catálogo global de plataformas.`);
    } else if (!enabledPlatforms.has(platform.id)) {
      errors.push(
        `${prefix}la plataforma '${platformSlug}' no está habilitada en tu catálogo. Actívala antes de importar.`,
      );
    }
  }

  if (errors.length > 0) {
    return { errors, warnings, changes: null };
  }

  const [active, allRows] = await Promise.all([
    prisma.tenantGame.findMany({ where: { tenantId, deletedAt: null }, orderBy: { id: 'asc' } }),
    prisma.tenantGame.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
  ]);

  const identityKey = (baseGameId: string, platformId: string): string => `${baseGameId}:${platformId}`;
  const slugKey = (platformId: string, slug: string): string => `${platformId}:${slug}`;

  const activeByIdentity = new Map<string, (typeof active)[number]>();
  const activeBySlug = new Map<string, (typeof active)[number]>();
  const allByIdentity = new Map<string, (typeof allRows)[number]>();
  const allBySlug = new Map<string, (typeof allRows)[number]>();

  for (const row of allRows) {
    if (!row.platformId) continue;
    allBySlug.set(slugKey(row.platformId, row.slug), row);
    if (row.baseGameId) allByIdentity.set(identityKey(row.baseGameId, row.platformId), row);
  }
  for (const row of active) {
    if (!row.platformId) continue;
    activeBySlug.set(slugKey(row.platformId, row.slug), row);
    if (row.baseGameId) activeByIdentity.set(identityKey(row.baseGameId, row.platformId), row);
  }

  const changes: ImportChanges = { create: [], update: [], delete: [], unchanged: 0 };
  const hit = new Set<string>();
  const declaredPlatformIds = new Set<string>();

  for (const item of parsed) {
    const prefix = `Oferta ${item.index + 1}: `;
    const data = item.data;
    const base = baseGameBySlug.get(data.baseGameSlug);
    const platform = platformBySlug.get(data.platformSlug);

    if (!base || !platform) {
      continue;
    }

    declaredPlatformIds.add(platform.id);

    const identity = identityKey(base.id, platform.id);
    const match =
      activeByIdentity.get(identity) ?? activeBySlug.get(slugKey(platform.id, item.slug));

    if (match && match.baseGameId !== base.id) {
      errors.push(
        match.baseGameId
          ? `${prefix}el slug '${item.slug}' ya pertenece a otra oferta de biblioteca.`
          : `${prefix}el slug '${item.slug}' pertenece a una oferta personalizada; retírala del archivo o cámbiale el slug.`,
      );
      continue;
    }

    if (match && data.slug && data.slug !== match.slug) {
      warnings.push(
        `${prefix}slug '${data.slug}' ignorado: la identidad de una oferta no se renombra (sigue '${match.slug}').`,
      );
    }

    const targetMode = data.priceMode ?? match?.priceMode ?? 'RULE';
    let targetPrice: number | null;
    if (targetMode === 'RULE') {
      if (data.price !== undefined && data.price !== null) {
        errors.push(`${prefix}price solo aplica cuando priceMode es MANUAL.`);
        continue;
      }
      targetPrice = null;
    } else if (data.price !== undefined && data.price !== null) {
      targetPrice = data.price;
    } else {
      targetPrice = match?.price === null || match?.price === undefined ? null : Number(match.price);
      if (targetPrice === null) {
        errors.push(`${prefix}price es obligatorio cuando priceMode es MANUAL.`);
        continue;
      }
    }

    const overrides = OVERRIDE_FIELDS.filter((field) => !absent(data[field])) as (typeof OVERRIDE_FIELDS)[number][];
    const cleared = uniqueSorted((data.clearedFields ?? []) as string[]);
    const hasOverride = overrides.length > 0 || cleared.length > 0;

    if (!match) {
      const retired =
        allByIdentity.get(identity) ?? allBySlug.get(slugKey(platform.id, item.slug));
      if (retired?.deletedAt) {
        errors.push(
          `${prefix}ya existe una oferta retirada para '${data.baseGameSlug}' en '${data.platformSlug}' (slug '${retired.slug}'); restáuralo antes de importar.`,
        );
        continue;
      }

      changes.create.push({
        index: item.index,
        baseGameId: base.id,
        platformId: platform.id,
        platformSlug: platform.slug,
        title: data.title ?? null,
        slug: item.slug,
        description: data.description ?? null,
        priceMode: targetMode,
        price: targetPrice,
        availability: data.availability ?? true,
        sizeValue: data.sizeValue ?? null,
        sizeUnit: data.sizeUnit ?? null,
        releaseYear: data.releaseYear ?? null,
        origin: hasOverride ? 'PERSONALIZADO' : 'BIBLIOTECA',
        minimumRequirements: data.minimumRequirements ?? null,
        recommendedRequirements: data.recommendedRequirements ?? null,
        clearedFields: cleared,
      });
      continue;
    }

    hit.add(match.id);

    const patch: Prisma.TenantGameUpdateInput = {};
    const fields: string[] = [];
    const currentPrice = match.price === null ? null : Number(match.price);

    if (targetMode !== match.priceMode) {
      fields.push('priceMode');
      patch.priceMode = targetMode;
    }
    if (targetPrice !== currentPrice) {
      fields.push('price');
      patch.price = targetPrice;
    }

    for (const field of overrides) {
      const changed =
        field === 'minimumRequirements' || field === 'recommendedRequirements'
          ? !sameJson(data[field], match[field])
          : !(
              data[field] === match[field] ||
              (absent(data[field]) && absent(match[field]))
            );
      if (!changed) {
        continue;
      }
      fields.push(field);
      if (field === 'minimumRequirements' || field === 'recommendedRequirements') {
        patch[field] = jsonValue(data[field]);
      } else {
        (patch as Record<string, unknown>)[field] = data[field];
      }
    }

    if (data.availability !== undefined && data.availability !== match.availability) {
      fields.push('availability');
      patch.availability = data.availability;
    }

    if (data.clearedFields !== undefined && !sameJson(match.clearedFields, cleared)) {
      fields.push('clearedFields');
      patch.clearedFields = jsonValue(cleared);
    }

    const origin: 'BIBLIOTECA' | 'PERSONALIZADO' =
      match.origin === 'PERSONALIZADO' || hasOverride ? 'PERSONALIZADO' : 'BIBLIOTECA';
    if (origin !== match.origin) {
      fields.push('origin');
      patch.origin = origin;
    }

    if (fields.length > 0) {
      changes.update.push({
        index: item.index,
        id: match.id,
        title: match.title,
        slug: match.slug,
        platform: platform.slug,
        fields,
        patch,
      });
    } else {
      changes.unchanged += 1;
    }
  }

  if (errors.length > 0) {
    return { errors, warnings, changes: null };
  }

  const conservedPlatformIds = new Set<string>();
  for (const row of active) {
    if (hit.has(row.id) || !row.platformId) continue;
    if (declaredPlatformIds.has(row.platformId)) {
      changes.delete.push({ id: row.id, title: row.title, slug: row.slug });
    } else {
      conservedPlatformIds.add(row.platformId);
    }
  }

  if (conservedPlatformIds.size > 0) {
    const conserved = active.filter((row) => row.platformId && conservedPlatformIds.has(row.platformId));
    const rows = await prisma.platform.findMany({
      where: { id: { in: [...conservedPlatformIds] } },
    });
    const names = rows
      .map((row) => row.slug)
      .sort()
      .join(', ');
    warnings.push(
      `Se conservan ${conserved.length} oferta(s) de plataformas que el archivo no declara (${names}). Solo se retiran ofertas de las plataformas incluidas en el archivo.`,
    );
  }

  return { errors, warnings, changes };
}

function validationError(analysis: ImportAnalysis): AppError {
  return new AppError(422, 'IMPORT_VALIDATION_FAILED', 'El archivo tiene errores de validación', {
    errors: analysis.errors,
    warnings: analysis.warnings,
  });
}

export async function exportCatalog(
  query: ExportQuery,
  auth: AuthContext | null,
  meta: RequestMeta,
): Promise<ExportResult> {
  const tenantId = await resolveTenantId(auth, query.tenantId);
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new AppError(422, 'TENANT_NOT_FOUND', 'El tenant indicado no existe');
  }

  const games = await prisma.tenantGame.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const metaRow = await prisma.catalogMetadata.findFirst({ where: { tenantId } });

  const baseGameIds = [
    ...new Set(games.map((row) => row.baseGameId).filter((id): id is string => id !== null)),
  ];
  const platformIds = [
    ...new Set(games.map((row) => row.platformId).filter((id): id is string => id !== null)),
  ];

  const [baseGames, platforms] = await Promise.all([
    baseGameIds.length
      ? prisma.baseGame.findMany({ where: { id: { in: baseGameIds }, deletedAt: null } })
      : Promise.resolve([]),
    platformIds.length
      ? prisma.platform.findMany({ where: { id: { in: platformIds }, deletedAt: null } })
      : Promise.resolve([]),
  ]);

  const baseGameById = new Map(baseGames.map((row) => [row.id, row]));
  const platformById = new Map(platforms.map((row) => [row.id, row]));

  const offers: Record<string, unknown>[] = [];
  const skipped: { slug: string; reason: string }[] = [];

  for (const row of games) {
    const base = row.baseGameId ? baseGameById.get(row.baseGameId) : undefined;
    const platform = row.platformId ? platformById.get(row.platformId) : undefined;

    if (!base) {
      skipped.push({
        slug: row.slug,
        reason: 'la oferta no tiene juego de biblioteca (catalog@2 solo admite ofertas de biblioteca)',
      });
      continue;
    }
    if (!platform || platform.tenantId !== null) {
      skipped.push({
        slug: row.slug,
        reason: 'la plataforma de la oferta no pertenece al catálogo global',
      });
      continue;
    }

    const cleared = Array.isArray(row.clearedFields)
      ? (row.clearedFields.filter((item): item is string => typeof item === 'string') as string[])
          .slice()
          .sort()
      : [];

    offers.push({
      baseGameSlug: base.slug,
      platformSlug: platform.slug,
      slug: row.slug,
      priceMode: row.priceMode,
      price: row.price === null ? null : Number(row.price),
      availability: row.availability,
      title: row.title,
      description: row.description,
      releaseYear: row.releaseYear,
      sizeValue: row.sizeValue,
      sizeUnit: row.sizeUnit,
      minimumRequirements: row.minimumRequirements ?? null,
      recommendedRequirements: row.recommendedRequirements ?? null,
      ...(cleared.length ? { clearedFields: cleared } : {}),
    });
  }

  const payload: Record<string, unknown> = {
    schema: CATALOG_SCHEMA,
    generatedAt: new Date().toISOString(),
    source: `catalogo-${tenant.slug}`,
    notice:
      'Exportación de ofertas por plataforma. Las ofertas listadas en "skipped" no se incluyen en "offers" ' +
      'porque catalog@2 solo admite ofertas con juego de biblioteca y plataforma global. El importador ignora ' +
      '"notice" y "skipped".',
    skipped,
    offers,
  };

  await prisma.auditLog.create({
    data: auditData({
      actor: auth,
      action: 'CATALOG_EXPORTED',
      entity: 'TenantGame',
      tenantId,
      metadata: {
        format: 'json',
        games: offers.length,
        skipped: skipped.length,
        version: metaRow?.version ?? 0,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
  });

  return { payload, filename: `catalogo-${tenant.slug}.json` };
}

export async function exportMediaManifest(
  query: ExportQuery,
  auth: AuthContext | null,
  meta: RequestMeta,
): Promise<ExportResult> {
  const tenantId = await resolveTenantId(auth, query.tenantId);
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new AppError(422, 'TENANT_NOT_FOUND', 'El tenant indicado no existe');
  }

  const rows = await prisma.gameMedia.findMany({
    where: { tenantId },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
  });

  const gameIds = [...new Set(rows.map((row) => row.gameId))];
  const games = gameIds.length
    ? await prisma.tenantGame.findMany({
        where: { id: { in: gameIds } },
        select: { id: true, title: true, slug: true },
      })
    : [];
  const gameById = new Map(games.map((game) => [game.id, game]));

  const assets = rows.map((row) => {
    const hosting = describeMediaHosting(row.url, row.publicId);
    const game = gameById.get(row.gameId);
    return {
      id: row.id,
      kind: row.kind,
      gameId: row.gameId,
      gameTitle: game?.title ?? null,
      gameSlug: game?.slug ?? null,
      status: row.status,
      url: row.url,
      publicId: row.publicId,
      hosting: hosting.hosting,
      provider: hosting.provider,
    };
  });

  const totals = {
    assets: assets.length,
    cloudinary: assets.filter((asset) => asset.hosting === 'cloudinary').length,
    external: assets.filter((asset) => asset.hosting === 'external').length,
    unknown: assets.filter((asset) => asset.hosting === 'unknown').length,
    missingUrl: assets.filter((asset) => asset.url === null).length,
    missingPublicId: assets.filter((asset) => asset.publicId === null).length,
  };

  const payload: Record<string, unknown> = {
    schema: MEDIA_MANIFEST_SCHEMA,
    exportedAt: new Date().toISOString(),
    tenant: tenant.slug,
    tenantId: tenant.id,
    notice:
      'Inventario de solo lectura. Describe qué recurso multimedia existe y dónde está ubicado. ' +
      'No es un archivo de restauración: una URL externa solo identifica la ubicación del recurso, ' +
      'no garantiza que siga disponible ni que exista una copia recuperable.',
    totals,
    assets,
  };

  await prisma.auditLog.create({
    data: auditData({
      actor: auth,
      action: 'MEDIA_MANIFEST_EXPORTED',
      entity: 'GameMedia',
      tenantId,
      metadata: { format: 'json', assets: rows.length },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
  });

  return { payload, filename: `manifest-multimedia-${tenant.slug}.json` };
}

export async function validateImport(input: ValidateImportInput, auth: AuthContext | null) {
  const tenantId = await resolveTenantId(auth, input.tenantId);

  try {
    const analysis = await analyzeImport(tenantId, input.catalog);
    return {
      valid: analysis.errors.length === 0,
      errors: analysis.errors,
      warnings: analysis.warnings,
    };
  } catch (error) {
    if (error instanceof AppError && error.code === 'IMPORT_FORMAT_INVALID') {
      return { valid: false, errors: [error.message], warnings: [] };
    }
    throw error;
  }
}

export async function previewImport(input: ValidateImportInput, auth: AuthContext | null) {
  const tenantId = await resolveTenantId(auth, input.tenantId);
  const analysis = await analyzeImport(tenantId, input.catalog);

  if (analysis.errors.length > 0 || !analysis.changes) {
    throw validationError(analysis);
  }

  const prisma = getPrisma();
  const fingerprint = await computeFingerprint(tenantId, prisma);

  return {
    warnings: analysis.warnings,
    fingerprint,
    changes: {
      create: analysis.changes.create.map((item) => ({
        index: item.index,
        title: item.title,
        slug: item.slug,
        platform: item.platformSlug,
        availability: item.availability,
      })),
      update: analysis.changes.update.map((item) => ({
        index: item.index,
        id: item.id,
        title: item.title,
        slug: item.slug,
        platform: item.platform,
        fields: item.fields,
      })),
      delete: analysis.changes.delete,
      unchanged: analysis.changes.unchanged,
    },
  };
}

export async function createImportBackup(
  input: ImportBackupInput,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  const tenantId = await resolveTenantId(auth, input.tenantId);
  return createBackup(auth, { type: 'PRE_IMPORT', tenantId }, meta);
}

export async function runImport(
  input: RunImportInput,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  if (input.confirm !== 'IMPORTAR') {
    throw new AppError(422, 'IMPORT_CONFIRM_REQUIRED', 'Escribe IMPORTAR para confirmar');
  }

  const tenantId = await resolveTenantId(auth, input.tenantId);
  const analysis = await analyzeImport(tenantId, input.catalog);

  if (analysis.errors.length > 0 || !analysis.changes) {
    throw validationError(analysis);
  }

  const plan = analysis.changes;
  const prisma = getPrisma();

  const backup = await prisma.backup.findUnique({ where: { id: input.backupId } });
  if (!backup) {
    throw new AppError(404, 'BACKUP_NOT_FOUND', 'Copia no encontrada');
  }
  if (
    backup.tenantId !== tenantId ||
    backup.type !== 'PRE_IMPORT' ||
    backup.status !== 'COMPLETED'
  ) {
    throw new AppError(
      422,
      'IMPORT_BACKUP_INVALID',
      'La copia previa no es válida para esta importación',
    );
  }

  const currentFingerprint = await computeFingerprint(tenantId, prisma);
  if (currentFingerprint !== input.fingerprint) {
    throw new AppError(
      409,
      'IMPORT_PREVIEW_STALE',
      'El catálogo cambió desde la vista previa; vuelve a comparar los cambios.',
    );
  }

  const counts = {
    created: plan.create.length,
    updated: plan.update.length,
    deleted: plan.delete.length,
    unchanged: plan.unchanged,
  };

  await prisma.auditLog.create({
    data: auditData({
      actor: auth,
      action: 'IMPORT_STARTED',
      entity: 'TenantGame',
      tenantId,
      metadata: { backupId: input.backupId, ...counts },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
  });

  await prisma.$transaction(async (tx) => {
    const fingerprintNow = await computeFingerprint(tenantId, tx);
    if (fingerprintNow !== input.fingerprint) {
      throw new AppError(
        409,
        'IMPORT_PREVIEW_STALE',
        'El catálogo cambió desde la vista previa; vuelve a comparar los cambios.',
      );
    }

    for (const item of plan.create) {
      const id = randomUUID();
      await tx.tenantGame.create({
        data: {
          id,
          tenantId,
          baseGameId: item.baseGameId,
          platformId: item.platformId,
          origin: item.origin,
          title: item.title,
          slug: item.slug,
          description: item.description,
          priceMode: item.priceMode,
          price: item.price,
          availability: item.availability,
          sizeValue: item.sizeValue,
          sizeUnit: item.sizeUnit,
          releaseYear: item.releaseYear,
          minimumRequirements: jsonValue(item.minimumRequirements),
          recommendedRequirements: jsonValue(item.recommendedRequirements),
          clearedFields: jsonValue(item.clearedFields),
          createdBy: auth?.id ?? null,
          updatedBy: auth?.id ?? null,
        },
      });
    }

    for (const item of plan.update) {
      await tx.tenantGame.update({
        where: { id: item.id },
        data: { ...item.patch, updatedBy: auth?.id ?? null },
      });
    }

    for (const item of plan.delete) {
      await tx.tenantGame.update({
        where: { id: item.id },
        data: { deletedAt: new Date(), deletedBy: auth?.id ?? null, updatedBy: auth?.id ?? null },
      });
    }

    await tx.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'IMPORT_COMPLETED',
        entity: 'TenantGame',
        tenantId,
        metadata: { backupId: input.backupId, ...counts },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    });

    const bump = await planCatalogBump(tenantId, tx);
    await bump.op;
  });

  const metaRow = await prisma.catalogMetadata.findFirst({ where: { tenantId } });

  return { ...counts, version: metaRow?.version ?? 0 };
}
