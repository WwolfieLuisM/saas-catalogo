import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getPrisma } from '../../config/database.js';
import type { Prisma, PrismaClient } from '../../generated/client.js';
import type { AuthContext } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import { createBackup } from '../backups/backups.service.js';
import { planCatalogBump } from '../catalog/catalog.service.js';
import { jsonValue } from '../games/game.shared.js';
import { resolveTenantId } from '../games/games.service.js';
import type {
  ExportQuery,
  ImportBackupInput,
  ImportGameEntry,
  RunImportInput,
  ValidateImportInput,
} from './data-transfer.schemas.js';
import { importGameEntrySchema } from './data-transfer.schemas.js';

const CATALOG_SCHEMA = 'luismi-platform/catalog@1';
const MEDIA_MANIFEST_SCHEMA = 'luismi-platform/media-manifest@1';

type DbClient = PrismaClient | Prisma.TransactionClient;

interface ExportResult {
  payload: Record<string, unknown>;
  filename: string;
}

interface PreparedCreate {
  index: number;
  title: string;
  slug: string;
  description: string | null;
  priceMode: 'RULE' | 'MANUAL';
  price: number | null;
  availability: boolean;
  sizeValue: number;
  sizeUnit: 'MB' | 'GB' | 'TB';
  releaseYear: number | null;
  categoryId: string | null;
  genreIds: string[];
  platformIds: string[];
  baseGameId: string | null;
  origin: 'BIBLIOTECA' | 'PERSONALIZADO';
  minimumRequirements: unknown;
  recommendedRequirements: unknown;
}

interface PreparedUpdate {
  index: number;
  id: string;
  title: string;
  slug: string;
  fields: string[];
  patch: Prisma.TenantGameUpdateInput;
  genreIds?: string[];
  platformIds?: string[];
  categoryId?: string | null;
}

interface PreparedDelete {
  id: string;
  title: string;
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

function groupIdsByGame(
  bridges: { tenantGameId: string; genreId?: string; platformId?: string }[],
  key: 'genreId' | 'platformId',
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const bridge of bridges) {
    const id = bridge[key];
    if (!id) continue;
    const list = grouped.get(bridge.tenantGameId) ?? [];
    list.push(id);
    grouped.set(bridge.tenantGameId, list);
  }
  return grouped;
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((id) => set.has(id));
}

function analyzeEntries(
  entries: unknown[],
  warnings: string[],
): { errors: string[]; parsed: { index: number; data: ImportGameEntry; idHint: string | null }[] } {
  const errors: string[] = [];
  const parsed: { index: number; data: ImportGameEntry; idHint: string | null }[] = [];

  entries.forEach((entry, position) => {
    const prefix = `Juego ${position + 1}: `;
    const result = importGameEntrySchema.safeParse(entry);

    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(prefix + formatIssue(issue));
      }
      return;
    }

    let idHint: string | null = null;
    if (result.data.id !== undefined) {
      if (z.string().uuid().safeParse(result.data.id).success) {
        idHint = result.data.id;
      } else {
        warnings.push(`${prefix}id no válido; se emparejará por slug.`);
      }
    }

    parsed.push({ index: position, data: result.data, idHint });
  });

  const seenIds = new Map<string, number>();
  const seenSlugs = new Map<string, number>();

  for (const item of parsed) {
    const prefix = `Juego ${item.index + 1}: `;

    if (item.idHint) {
      const previous = seenIds.get(item.idHint);
      if (previous !== undefined) {
        errors.push(`${prefix}duplicado (id del juego ${previous + 1}).`);
      } else {
        seenIds.set(item.idHint, item.index);
      }
    }

    const previousSlug = seenSlugs.get(item.data.slug);
    if (previousSlug !== undefined) {
      errors.push(`${prefix}duplicado (slug '${item.data.slug}', juego ${previousSlug + 1}).`);
    } else {
      seenSlugs.set(item.data.slug, item.index);
    }

    for (const [listKey, label] of [
      ['genreSlugs', 'género'],
      ['platformSlugs', 'plataforma'],
    ] as const) {
      const list = item.data[listKey];
      if (!list) continue;
      const seenList = new Set<string>();
      for (const slug of list) {
        if (seenList.has(slug)) {
          errors.push(`${prefix}${label} duplicado '${slug}'.`);
        } else {
          seenList.add(slug);
        }
      }
    }
  }

  return { errors, parsed };
}

async function analyzeImport(tenantId: string, raw: unknown): Promise<ImportAnalysis> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let entries: unknown[];
  let payloadObject: Record<string, unknown> | null = null;

  if (Array.isArray(raw)) {
    entries = raw;
  } else if (raw && typeof raw === 'object' && Array.isArray((raw as { games?: unknown }).games)) {
    payloadObject = raw as Record<string, unknown>;
    entries = (raw as { games: unknown[] }).games;
  } else {
    throw new AppError(422, 'IMPORT_FORMAT_INVALID', 'El archivo debe contener una lista "games"');
  }

  if (payloadObject && payloadObject['tenantId'] !== undefined) {
    warnings.push(
      'El archivo incluye un tenantId. Se ignora: el servidor siempre usa el de tu sesión.',
    );
  }

  const structural = analyzeEntries(entries, warnings);
  errors.push(...structural.errors);
  const parsed = structural.parsed;

  if (errors.length > 0) {
    return { errors, warnings, changes: null };
  }

  const prisma = getPrisma();
  const [active, allRows] = await Promise.all([
    prisma.tenantGame.findMany({ where: { tenantId, deletedAt: null }, orderBy: { id: 'asc' } }),
    prisma.tenantGame.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
  ]);

  const categorySlugs = new Set<string>();
  const genreSlugs = new Set<string>();
  const platformSlugs = new Set<string>();
  const baseGameSlugs = new Set<string>();

  for (const item of parsed) {
    if (item.data.categorySlug) categorySlugs.add(item.data.categorySlug);
    for (const slug of item.data.genreSlugs ?? []) genreSlugs.add(slug);
    for (const slug of item.data.platformSlugs ?? []) platformSlugs.add(slug);
    if (item.data.baseGameSlug) baseGameSlugs.add(item.data.baseGameSlug);
  }

  const [categories, genres, platforms, baseGames] = await Promise.all([
    categorySlugs.size
      ? prisma.category.findMany({
          where: { tenantId, slug: { in: [...categorySlugs] }, deletedAt: null },
        })
      : Promise.resolve([]),
    genreSlugs.size
      ? prisma.genre.findMany({
          where: { tenantId, slug: { in: [...genreSlugs] }, deletedAt: null },
        })
      : Promise.resolve([]),
    platformSlugs.size
      ? prisma.platform.findMany({
          where: { tenantId, slug: { in: [...platformSlugs] }, deletedAt: null },
        })
      : Promise.resolve([]),
    baseGameSlugs.size
      ? prisma.baseGame.findMany({ where: { slug: { in: [...baseGameSlugs] }, deletedAt: null } })
      : Promise.resolve([]),
  ]);

  const categoryBySlug = new Map(categories.map((row) => [row.slug, row]));
  const genreBySlug = new Map(genres.map((row) => [row.slug, row]));
  const platformBySlug = new Map(platforms.map((row) => [row.slug, row]));
  const baseGameBySlug = new Map(baseGames.map((row) => [row.slug, row]));

  for (const item of parsed) {
    const prefix = `Juego ${item.index + 1}: `;
    const data = item.data;

    if (data.categorySlug && !categoryBySlug.has(data.categorySlug)) {
      errors.push(`${prefix}la categoría '${data.categorySlug}' no existe en este catálogo.`);
    }
    if (data.baseGameSlug && !baseGameBySlug.has(data.baseGameSlug)) {
      errors.push(
        `${prefix}el juego de biblioteca '${data.baseGameSlug}' no existe o está eliminado.`,
      );
    }
    for (const slug of data.genreSlugs ?? []) {
      if (!genreBySlug.has(slug)) {
        errors.push(`${prefix}el género '${slug}' no existe en este catálogo.`);
      }
    }
    for (const slug of data.platformSlugs ?? []) {
      if (!platformBySlug.has(slug)) {
        errors.push(`${prefix}la plataforma '${slug}' no existe en este catálogo.`);
      }
    }
  }

  if (errors.length > 0) {
    return { errors, warnings, changes: null };
  }

  const activeIds = active.map((row) => row.id);
  const [genreBridges, platformBridges] = await Promise.all([
    activeIds.length
      ? prisma.tenantGameGenre.findMany({ where: { tenantGameId: { in: activeIds } } })
      : Promise.resolve([]),
    activeIds.length
      ? prisma.gamePlatform.findMany({ where: { tenantGameId: { in: activeIds } } })
      : Promise.resolve([]),
  ]);
  const genreIdsByGame = groupIdsByGame(genreBridges, 'genreId');
  const platformIdsByGame = groupIdsByGame(platformBridges, 'platformId');

  const activeBaseIds = [
    ...new Set(active.map((row) => row.baseGameId).filter((id): id is string => id !== null)),
  ];
  const activeBases = activeBaseIds.length
    ? await prisma.baseGame.findMany({ where: { id: { in: activeBaseIds } } })
    : [];
  const baseById = new Map(activeBases.map((row) => [row.id, row]));
  const publishedBaseIds = new Set(
    allRows.map((row) => row.baseGameId).filter((id): id is string => id !== null),
  );

  const activeById = new Map(active.map((row) => [row.id, row]));
  const activeBySlug = new Map(active.map((row) => [row.slug, row]));
  const rowsBySlugAll = new Map(allRows.map((row) => [row.slug, row]));
  const hit = new Set<string>();

  const changes: ImportChanges = {
    create: [],
    update: [],
    delete: [],
    unchanged: 0,
  };

  const lockedWarning = (prefix: string, field: string): void => {
    warnings.push(`${prefix}campo de biblioteca '${field}' ignorado (origen BIBLIOTECA).`);
  };

  for (const item of parsed) {
    const prefix = `Juego ${item.index + 1}: `;
    const data = item.data;
    const match =
      (item.idHint ? activeById.get(item.idHint) : undefined) ?? activeBySlug.get(data.slug);

    if (!match) {
      const owner = rowsBySlugAll.get(data.slug);
      if (owner && owner.deletedAt) {
        errors.push(
          `${prefix}el slug '${data.slug}' pertenece a un juego eliminado; restáuralo antes de importar.`,
        );
        continue;
      }

      const priceMode = data.priceMode ?? 'RULE';
      let price: number | null;
      if (priceMode === 'RULE') {
        if (data.price !== undefined && data.price !== null) {
          errors.push(`${prefix}price solo aplica cuando priceMode es MANUAL.`);
          continue;
        }
        price = null;
      } else {
        price = data.price ?? null;
        if (price === null) {
          errors.push(`${prefix}price es obligatorio cuando priceMode es MANUAL.`);
          continue;
        }
      }

      let baseGameId: string | null = null;
      let origin: 'BIBLIOTECA' | 'PERSONALIZADO' = 'PERSONALIZADO';
      if (data.baseGameSlug) {
        const base = baseGameBySlug.get(data.baseGameSlug);
        if (!base) {
          errors.push(
            `${prefix}el juego de biblioteca '${data.baseGameSlug}' no existe o está eliminado.`,
          );
          continue;
        }
        if (publishedBaseIds.has(base.id)) {
          errors.push(
            `${prefix}la biblioteca '${data.baseGameSlug}' ya está publicada en este catálogo.`,
          );
          continue;
        }
        baseGameId = base.id;
        origin = 'BIBLIOTECA';
      }

      changes.create.push({
        index: item.index,
        title: data.title,
        slug: data.slug,
        description: data.description ?? null,
        priceMode,
        price,
        availability: data.availability ?? true,
        sizeValue: data.sizeValue,
        sizeUnit: data.sizeUnit,
        releaseYear: data.releaseYear ?? null,
        categoryId: data.categorySlug ? (categoryBySlug.get(data.categorySlug)?.id ?? null) : null,
        genreIds: uniqueSorted(
          (data.genreSlugs ?? []).map((slug) => genreBySlug.get(slug)?.id ?? ''),
        ).filter(Boolean),
        platformIds: uniqueSorted(
          (data.platformSlugs ?? []).map((slug) => platformBySlug.get(slug)?.id ?? ''),
        ).filter(Boolean),
        baseGameId,
        origin,
        minimumRequirements: data.minimumRequirements ?? null,
        recommendedRequirements: data.recommendedRequirements ?? null,
      });
      continue;
    }

    hit.add(match.id);

    if (data.slug !== match.slug) {
      const owner = rowsBySlugAll.get(data.slug);
      if (owner && owner.id !== match.id) {
        errors.push(
          owner.deletedAt
            ? `${prefix}el slug '${data.slug}' pertenece a un juego eliminado; restáuralo antes de importar.`
            : `${prefix}el slug '${data.slug}' ya pertenece a otro juego.`,
        );
        continue;
      }
    }

    const patch: Prisma.TenantGameUpdateInput = {};
    const fields: string[] = [];
    const isLibrary = match.origin === 'BIBLIOTECA';

    if (data.title !== match.title) {
      if (isLibrary) {
        lockedWarning(prefix, 'title');
      } else {
        fields.push('title');
        patch.title = data.title;
      }
    }

    if (data.slug !== match.slug && !isLibrary) {
      fields.push('slug');
      patch.slug = data.slug;
    }

    if (data.description !== undefined && (data.description ?? null) !== match.description) {
      if (isLibrary) {
        lockedWarning(prefix, 'description');
      } else {
        fields.push('description');
        patch.description = data.description ?? null;
      }
    }

    if (data.sizeValue !== match.sizeValue) {
      if (isLibrary) {
        lockedWarning(prefix, 'sizeValue');
      } else {
        fields.push('sizeValue');
        patch.sizeValue = data.sizeValue;
      }
    }

    if (data.sizeUnit !== match.sizeUnit) {
      if (isLibrary) {
        lockedWarning(prefix, 'sizeUnit');
      } else {
        fields.push('sizeUnit');
        patch.sizeUnit = data.sizeUnit;
      }
    }

    if (
      data.releaseYear !== undefined &&
      (data.releaseYear ?? null) !== (match.releaseYear ?? null)
    ) {
      if (isLibrary) {
        lockedWarning(prefix, 'releaseYear');
      } else {
        fields.push('releaseYear');
        patch.releaseYear = data.releaseYear ?? null;
      }
    }

    if (
      data.minimumRequirements !== undefined &&
      JSON.stringify(canonicalJson(data.minimumRequirements ?? null)) !==
        JSON.stringify(canonicalJson(match.minimumRequirements ?? null))
    ) {
      if (isLibrary) {
        lockedWarning(prefix, 'minimumRequirements');
      } else {
        fields.push('minimumRequirements');
        patch.minimumRequirements = jsonValue(data.minimumRequirements ?? null);
      }
    }

    if (
      data.recommendedRequirements !== undefined &&
      JSON.stringify(canonicalJson(data.recommendedRequirements ?? null)) !==
        JSON.stringify(canonicalJson(match.recommendedRequirements ?? null))
    ) {
      if (isLibrary) {
        lockedWarning(prefix, 'recommendedRequirements');
      } else {
        fields.push('recommendedRequirements');
        patch.recommendedRequirements = jsonValue(data.recommendedRequirements ?? null);
      }
    }

    if (data.availability !== undefined && data.availability !== match.availability) {
      fields.push('availability');
      patch.availability = data.availability;
    }

    const newPriceMode = data.priceMode ?? match.priceMode;
    let targetPrice: number | null;
    if (newPriceMode === 'RULE') {
      if (data.price !== undefined && data.price !== null) {
        errors.push(`${prefix}price solo aplica cuando priceMode es MANUAL.`);
        continue;
      }
      targetPrice = null;
    } else {
      targetPrice = data.price ?? (match.price === null ? null : Number(match.price));
      if (targetPrice === null) {
        errors.push(`${prefix}price es obligatorio cuando priceMode es MANUAL.`);
        continue;
      }
    }

    const currentPrice = match.price === null ? null : Number(match.price);
    if (newPriceMode !== match.priceMode) {
      fields.push('priceMode');
      patch.priceMode = newPriceMode;
    }
    if (targetPrice !== currentPrice) {
      fields.push('price');
      patch.price = targetPrice;
    }

    let genreIds: string[] | undefined;
    if (data.genreSlugs !== undefined) {
      genreIds = uniqueSorted(
        data.genreSlugs.map((slug) => genreBySlug.get(slug)?.id ?? ''),
      ).filter(Boolean);
      const currentIds = genreIdsByGame.get(match.id) ?? [];
      if (!sameIds(currentIds, genreIds)) {
        fields.push('genreSlugs');
      } else {
        genreIds = undefined;
      }
    }

    let platformIds: string[] | undefined;
    if (data.platformSlugs !== undefined) {
      platformIds = uniqueSorted(
        data.platformSlugs.map((slug) => platformBySlug.get(slug)?.id ?? ''),
      ).filter(Boolean);
      const currentIds = platformIdsByGame.get(match.id) ?? [];
      if (!sameIds(currentIds, platformIds)) {
        fields.push('platformSlugs');
      } else {
        platformIds = undefined;
      }
    }

    let categoryIdPatch: string | null | undefined;
    if (data.categorySlug !== undefined) {
      const categoryId = data.categorySlug
        ? (categoryBySlug.get(data.categorySlug)?.id ?? null)
        : null;
      if (categoryId !== match.categoryId) {
        fields.push('categorySlug');
        categoryIdPatch = categoryId;
      }
    }

    if (data.baseGameSlug !== undefined && data.baseGameSlug !== null) {
      const owner = match.baseGameId ? baseById.get(match.baseGameId) : undefined;
      if (!owner) {
        errors.push(`${prefix}el juego es personalizado y no puede vincularse a la biblioteca.`);
        continue;
      }
      if (owner.slug !== data.baseGameSlug) {
        errors.push(`${prefix}no se puede cambiar el juego de biblioteca asociado.`);
        continue;
      }
    } else if (data.baseGameSlug === null && match.origin === 'BIBLIOTECA') {
      warnings.push(`${prefix}sin referencia de biblioteca; se conserva la referencia actual.`);
    }

    if (fields.length > 0) {
      changes.update.push({
        index: item.index,
        id: match.id,
        title: match.title,
        slug: match.slug,
        fields,
        patch,
        genreIds,
        platformIds,
        ...(categoryIdPatch !== undefined ? { categoryId: categoryIdPatch } : {}),
      });
    } else {
      changes.unchanged += 1;
    }
  }

  if (errors.length > 0) {
    return { errors, warnings, changes: null };
  }

  for (const row of active) {
    if (!hit.has(row.id)) {
      changes.delete.push({ id: row.id, title: row.title, slug: row.slug });
    }
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
  const gameIds = games.map((row) => row.id);

  const [genreBridges, platformBridges, metaRow] = await Promise.all([
    gameIds.length
      ? prisma.tenantGameGenre.findMany({ where: { tenantGameId: { in: gameIds } } })
      : Promise.resolve([]),
    gameIds.length
      ? prisma.gamePlatform.findMany({ where: { tenantGameId: { in: gameIds } } })
      : Promise.resolve([]),
    prisma.catalogMetadata.findFirst({ where: { tenantId } }),
  ]);

  const categoryIds = [
    ...new Set(games.map((row) => row.categoryId).filter((id): id is string => id !== null)),
  ];
  const genreIds = [...new Set(genreBridges.map((bridge) => bridge.genreId))];
  const platformIds = [...new Set(platformBridges.map((bridge) => bridge.platformId))];
  const baseGameIds = [
    ...new Set(games.map((row) => row.baseGameId).filter((id): id is string => id !== null)),
  ];

  const [categories, genres, platforms, baseGames] = await Promise.all([
    categoryIds.length
      ? prisma.category.findMany({ where: { id: { in: categoryIds }, deletedAt: null } })
      : Promise.resolve([]),
    genreIds.length
      ? prisma.genre.findMany({ where: { id: { in: genreIds }, deletedAt: null } })
      : Promise.resolve([]),
    platformIds.length
      ? prisma.platform.findMany({ where: { id: { in: platformIds }, deletedAt: null } })
      : Promise.resolve([]),
    baseGameIds.length
      ? prisma.baseGame.findMany({ where: { id: { in: baseGameIds }, deletedAt: null } })
      : Promise.resolve([]),
  ]);

  const categoryById = new Map(categories.map((row) => [row.id, row]));
  const genreById = new Map(genres.map((row) => [row.id, row]));
  const platformById = new Map(platforms.map((row) => [row.id, row]));
  const baseGameById = new Map(baseGames.map((row) => [row.id, row]));

  const genreIdsByGame = groupIdsByGame(genreBridges, 'genreId');
  const platformIdsByGame = groupIdsByGame(platformBridges, 'platformId');

  const payload: Record<string, unknown> = {
    schema: CATALOG_SCHEMA,
    exportedAt: new Date().toISOString(),
    tenant: tenant.slug,
    version: metaRow?.version ?? 0,
    games: games.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      description: row.description,
      priceMode: row.priceMode,
      price: row.price === null ? null : Number(row.price),
      availability: row.availability,
      sizeValue: row.sizeValue,
      sizeUnit: row.sizeUnit,
      releaseYear: row.releaseYear,
      categorySlug: row.categoryId ? (categoryById.get(row.categoryId)?.slug ?? null) : null,
      genreSlugs: (genreIdsByGame.get(row.id) ?? [])
        .map((id) => genreById.get(id)?.slug)
        .filter((slug): slug is string => slug !== undefined)
        .sort(),
      platformSlugs: (platformIdsByGame.get(row.id) ?? [])
        .map((id) => platformById.get(id)?.slug)
        .filter((slug): slug is string => slug !== undefined)
        .sort(),
      baseGameSlug: row.baseGameId ? (baseGameById.get(row.baseGameId)?.slug ?? null) : null,
      minimumRequirements: row.minimumRequirements,
      recommendedRequirements: row.recommendedRequirements,
    })),
  };

  await prisma.auditLog.create({
    data: auditData({
      actor: auth,
      action: 'CATALOG_EXPORTED',
      entity: 'TenantGame',
      tenantId,
      metadata: { format: 'json', games: games.length, version: payload['version'] },
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

  const payload: Record<string, unknown> = {
    schema: MEDIA_MANIFEST_SCHEMA,
    exportedAt: new Date().toISOString(),
    tenant: tenant.slug,
    assets: rows.map((row) => ({
      publicId: row.publicId,
      kind: row.kind,
      gameId: row.gameId,
      status: row.status,
    })),
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
        availability: item.availability,
      })),
      update: analysis.changes.update.map((item) => ({
        index: item.index,
        id: item.id,
        title: item.title,
        slug: item.slug,
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
          categoryId: item.categoryId,
          minimumRequirements: jsonValue(item.minimumRequirements),
          recommendedRequirements: jsonValue(item.recommendedRequirements),
          createdBy: auth?.id ?? null,
          updatedBy: auth?.id ?? null,
        },
      });

      if (item.genreIds.length) {
        await tx.tenantGameGenre.createMany({
          data: item.genreIds.map((genreId) => ({ tenantGameId: id, genreId })),
        });
      }
      if (item.platformIds.length) {
        await tx.gamePlatform.createMany({
          data: item.platformIds.map((platformId) => ({ tenantGameId: id, platformId })),
        });
      }
    }

    for (const item of plan.update) {
      const data: Prisma.TenantGameUpdateInput = {
        ...item.patch,
        ...(item.categoryId !== undefined ? { categoryId: item.categoryId } : {}),
        updatedBy: auth?.id ?? null,
      };
      await tx.tenantGame.update({ where: { id: item.id }, data });

      if (item.genreIds !== undefined) {
        await tx.tenantGameGenre.deleteMany({ where: { tenantGameId: item.id } });
        if (item.genreIds.length) {
          await tx.tenantGameGenre.createMany({
            data: item.genreIds.map((genreId) => ({ tenantGameId: item.id, genreId })),
          });
        }
      }
      if (item.platformIds !== undefined) {
        await tx.gamePlatform.deleteMany({ where: { tenantGameId: item.id } });
        if (item.platformIds.length) {
          await tx.gamePlatform.createMany({
            data: item.platformIds.map((platformId) => ({ tenantGameId: item.id, platformId })),
          });
        }
      }
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
