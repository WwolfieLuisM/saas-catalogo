import { createHash, randomUUID } from 'node:crypto';
import type { ZodError } from 'zod';
import { getPrisma } from '../../config/database.js';
import type { Prisma } from '../../generated/client.js';
import type { AuthContext } from '../../middleware/auth.js';
import { AppError } from '../../utils/appError.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import { jsonValue } from '../games/game.shared.js';
import { syncCover } from './library-import.media.js';
import {
  LIBRARY_IMPORT_SCHEMA,
  libraryImportRecordSchema,
  type LibraryImportEnvelope,
  type LibraryImportRecord,
} from './library-import.schemas.js';

const SLUG_ECHO_LIMIT = 50;
const QUERY_CHUNK_SIZE = 500;

const PLATFORM_SIZE_PRIORITY = [
  'pc',
  'ps5',
  'ps4',
  'xbox-series-x',
  'xbox-one',
  'switch',
];

export type LibraryImportAction = 'create' | 'update' | 'skip' | 'error';
export type LibraryImportStatus = 'ACTIVE' | 'INCOMPLETE';
export type SizeUnitValue = 'MB' | 'GB' | 'TB';

export interface LibraryImportRecordError {
  code: string;
  field: string;
  message: string;
}

export interface LibraryImportPreviewRecord {
  index: number;
  slug: string | null;
  action: LibraryImportAction;
  status: LibraryImportStatus | null;
  errors: LibraryImportRecordError[];
  changes: string[];
}

export interface LibraryImportValidateResult {
  fingerprint: string;
  stateFingerprint: string;
  schema: string;
  summary: {
    total: number;
    create: number;
    update: number;
    skip: number;
    error: number;
  };
  records: LibraryImportPreviewRecord[];
  taxonomy: {
    missingGenres: string[];
    missingCategories: string[];
    missingPlatforms: string[];
  };
}

interface MergedSize {
  sizeValue: number;
  sizeUnit: SizeUnitValue;
}

interface ResolvedVariant {
  platformId: string;
  sizeValue: number | null;
  sizeUnit: SizeUnitValue | null;
  minimumRequirements: unknown;
  recommendedRequirements: unknown;
  provenance: unknown;
}

export interface LibraryImportPlanRecord {
  index: number;
  slug: string | null;
  action: LibraryImportAction;
  status: LibraryImportStatus | null;
  errors: LibraryImportRecordError[];
  changes: string[];
  record: LibraryImportRecord | null;
  existingId: string | null;
  categoryId: string | null;
  genreIds: string[];
  variants: ResolvedVariant[];
  size: MergedSize;
}

export interface LibraryImportPlan {
  fingerprint: string;
  stateFingerprint: string;
  schema: string;
  records: LibraryImportPlanRecord[];
  taxonomy: {
    missingGenres: string[];
    missingCategories: string[];
    missingPlatforms: string[];
  };
}

interface LibraryStateSlice {
  games: Array<{
    slug: string;
    id: string;
    updatedAt: Date | null;
    title: string;
    description: string | null;
    releaseYear: number | null;
    developer: string | null;
    publisher: string | null;
    keywords: string | null;
    categoryId: string | null;
    sizeValue: number;
    sizeUnit: SizeUnitValue;
    status: string;
    deletedAt: Date | null;
    minimumRequirements: unknown;
    recommendedRequirements: unknown;
  }>;
  genreLinks: Array<{ baseGameId: string; genreId: string }>;
  variantLinks: Array<{
    baseGameId: string;
    platformId: string;
    sizeValue: number | null;
    sizeUnit: string | null;
    minimumRequirements: unknown;
    recommendedRequirements: unknown;
    provenance: unknown;
  }>;
  covers: Array<{ id: string; baseGameId: string; status: string }>;
}

async function loadLibraryState(
  client: Pick<
    ReturnType<typeof getPrisma>,
    'baseGame' | 'baseGameGenre' | 'baseGamePlatform' | 'libraryMedia'
  >,
  slugs: string[],
): Promise<LibraryStateSlice> {
  const games = await chunkedQuery(slugs, (chunk) =>
    client.baseGame.findMany({ where: { slug: { in: chunk } } }),
  );
  const ids = games.map((row) => row.id);

  const [genreLinks, variantLinks, covers] = await Promise.all([
    chunkedQuery(ids, (chunk) =>
      client.baseGameGenre.findMany({ where: { baseGameId: { in: chunk } } }),
    ),
    chunkedQuery(ids, (chunk) =>
      client.baseGamePlatform.findMany({ where: { baseGameId: { in: chunk } } }),
    ),
    chunkedQuery(ids, (chunk) =>
      client.libraryMedia.findMany({ where: { baseGameId: { in: chunk }, kind: 'COVER' } }),
    ),
  ]);

  return { games, genreLinks, variantLinks, covers };
}

function stateFingerprintOf(slice: LibraryStateSlice): string {
  return createHash('sha256')
    .update(
      canonicalJson({
        games: [...slice.games]
          .map((row) => ({
            slug: row.slug,
            id: row.id,
            updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : null,
            title: row.title,
            description: row.description,
            releaseYear: row.releaseYear,
            developer: row.developer,
            publisher: row.publisher,
            keywords: row.keywords,
            categoryId: row.categoryId,
            sizeValue: row.sizeValue,
            sizeUnit: row.sizeUnit,
            status: row.status,
            deletedAt: row.deletedAt instanceof Date ? row.deletedAt.toISOString() : null,
            minimumRequirements: row.minimumRequirements,
            recommendedRequirements: row.recommendedRequirements,
          }))
          .sort((left, right) => (left.slug < right.slug ? -1 : 1)),
        genreLinks: [...slice.genreLinks]
          .map((link) => `${link.baseGameId}:${link.genreId}`)
          .sort(),
        variantLinks: [...slice.variantLinks]
          .map((link) => ({
            baseGameId: link.baseGameId,
            platformId: link.platformId,
            sizeValue: link.sizeValue,
            sizeUnit: link.sizeUnit,
            minimumRequirements: link.minimumRequirements,
            recommendedRequirements: link.recommendedRequirements,
            provenance: link.provenance,
          }))
          .sort((left, right) =>
            `${left.baseGameId}:${left.platformId}` < `${right.baseGameId}:${right.platformId}` ? -1 : 1,
          ),
        covers: [...slice.covers]
          .map((cover) => `${cover.baseGameId}:${cover.id}:${cover.status}`)
          .sort(),
      }),
      'utf8',
    )
    .digest('hex');
}

export async function buildLibraryImportPlan(
  envelope: LibraryImportEnvelope,
): Promise<LibraryImportPlan> {
  if (envelope.schema !== LIBRARY_IMPORT_SCHEMA) {
    throw new AppError(
      400,
      'LIBRARY_IMPORT_SCHEMA_UNSUPPORTED',
      `El archivo declara "${envelope.schema}" y el importador solo admite "${LIBRARY_IMPORT_SCHEMA}": regenera el JSON con el prompt v2.`,
    );
  }

  const prisma = getPrisma();
  const parsedRecords = envelope.games.map((raw) =>
    libraryImportRecordSchema.safeParse(raw),
  );
  const validRecords = parsedRecords.flatMap((parsed) => (parsed.success ? [parsed.data] : []));

  const wantedGenres = unique(validRecords.flatMap((record) => record.genreSlugs ?? []));
  const wantedCategories = unique(
    validRecords.flatMap((record) => (record.categorySlug ? [record.categorySlug] : [])),
  );
  const wantedPlatforms = unique(
    validRecords.flatMap((record) =>
      record.platformVariants.map((variant) => variant.platformSlug),
    ),
  );

  const [genreRows, categoryRows, platformRows] = await Promise.all([
    chunkedQuery(wantedGenres, (chunk) =>
      prisma.genre.findMany({
        where: { slug: { in: chunk }, tenantId: null, deletedAt: null },
        select: { id: true, slug: true },
      }),
    ),
    chunkedQuery(wantedCategories, (chunk) =>
      prisma.category.findMany({
        where: { slug: { in: chunk }, tenantId: null, deletedAt: null },
        select: { id: true, slug: true },
      }),
    ),
    chunkedQuery(wantedPlatforms, (chunk) =>
      prisma.platform.findMany({
        where: { slug: { in: chunk }, tenantId: null, deletedAt: null },
        select: { id: true, slug: true },
      }),
    ),
  ]);

  const genreIdBySlug = new Map(genreRows.map((row) => [row.slug, row.id]));
  const categoryIdBySlug = new Map(categoryRows.map((row) => [row.slug, row.id]));
  const platformIdBySlug = new Map(platformRows.map((row) => [row.slug, row.id]));

  const stateSlice = await loadLibraryState(
    prisma,
    unique(validRecords.map((record) => record.slug)),
  );
  const stateFingerprint = stateFingerprintOf(stateSlice);
  const gameBySlug = new Map(stateSlice.games.map((row) => [row.slug, row]));
  const genreIdsByGame = groupValues(stateSlice.genreLinks, 'baseGameId', 'genreId');
  const variantsByGame = groupRows(stateSlice.variantLinks, 'baseGameId');
  const gamesWithCover = new Set(
    stateSlice.covers
      .filter((cover) => cover.status === 'OK')
      .map((cover) => cover.baseGameId),
  );
  const slugSeen = new Set<string>();
  const records: LibraryImportPlanRecord[] = [];

  envelope.games.forEach((raw, index) => {
    const parsed = parsedRecords[index];

    if (!parsed || !parsed.success) {
      records.push({
        index,
        slug: bestEffortSlug(raw),
        action: 'error',
        status: null,
        errors: parsed ? zodIssuesToErrors(parsed.error) : [],
        changes: [],
        record: null,
        existingId: null,
        categoryId: null,
        genreIds: [],
        variants: [],
        size: { sizeValue: 0, sizeUnit: 'GB' },
      });
      return;
    }

    const record = parsed.data;
    const errors = semanticErrors(record, {
      genreIdBySlug,
      categoryIdBySlug,
      platformIdBySlug,
    });

    if (slugSeen.has(record.slug)) {
      errors.unshift({
        code: 'DUPLICATE_SLUG_IN_FILE',
        field: 'slug',
        message: `El slug "${record.slug}" ya aparece en otro registro del mismo archivo`,
      });
    }

    if (errors.length > 0) {
      records.push({
        index,
        slug: record.slug,
        action: 'error',
        status: null,
        errors,
        changes: [],
        record: null,
        existingId: null,
        categoryId: null,
        genreIds: [],
        variants: [],
        size: { sizeValue: 0, sizeUnit: 'GB' },
      });
      return;
    }

    const existing = gameBySlug.get(record.slug);
    slugSeen.add(record.slug);
    const size = resolveMergedSize(record, existing);
    const genreIds = [
      ...new Set(
        (record.genreSlugs ?? [])
          .map((slug) => genreIdBySlug.get(slug))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const categoryId = record.categorySlug
      ? (categoryIdBySlug.get(record.categorySlug) ?? null)
      : null;
    const hasCover = existing ? gamesWithCover.has(existing.id) : false;
    const status = deriveStatus(record, existing, size, hasCover);

    let action: LibraryImportAction;
    let changes: string[];

    if (!existing) {
      action = 'create';
      changes = ['+new'];
    } else {
      changes = diffChanges(record, existing, {
        status,
        size,
        genreIds: new Set(genreIds),
        genreIdsExisting: genreIdsByGame.get(existing.id) ?? new Set<string>(),
        categoryId,
        variantLinks: variantsByGame.get(existing.id) ?? [],
        platformIdBySlug,
        hasCover,
      });
      action = changes.length > 0 ? 'update' : 'skip';
    }

    records.push({
      index,
      slug: record.slug,
      action,
      status,
      errors: [],
      changes,
      record,
      existingId: existing?.id ?? null,
      categoryId,
      genreIds,
      variants: record.platformVariants.map((variant) => ({
        platformId: platformIdBySlug.get(variant.platformSlug) ?? '',
        sizeValue: variant.sizeValue ?? null,
        sizeUnit: variant.sizeUnit ?? null,
        minimumRequirements: variant.minimumRequirements ?? null,
        recommendedRequirements: variant.recommendedRequirements ?? null,
        provenance: variant.provenance ?? null,
      })),
      size,
    });
  });

  return {
    fingerprint: fingerprintOf(envelope.games),
    stateFingerprint,
    schema: envelope.schema,
    records,
    taxonomy: {
      missingGenres: wantedGenres.filter((slug) => !genreIdBySlug.has(slug)),
      missingCategories: wantedCategories.filter((slug) => !categoryIdBySlug.has(slug)),
      missingPlatforms: wantedPlatforms.filter((slug) => !platformIdBySlug.has(slug)),
    },
  };
}

export async function validateLibraryImport(
  envelope: LibraryImportEnvelope,
): Promise<LibraryImportValidateResult> {
  const plan = await buildLibraryImportPlan(envelope);
  const summary = { total: plan.records.length, create: 0, update: 0, skip: 0, error: 0 };

  for (const entry of plan.records) summary[entry.action] += 1;

  return {
    fingerprint: plan.fingerprint,
    stateFingerprint: plan.stateFingerprint,
    schema: plan.schema,
    summary,
    records: plan.records.map((entry) => ({
      index: entry.index,
      slug: entry.slug,
      action: entry.action,
      status: entry.status,
      errors: entry.errors,
      changes: entry.changes,
    })),
    taxonomy: plan.taxonomy,
  };
}

export interface LibraryImportImportRecord {
  index: number;
  slug: string | null;
  action: LibraryImportAction;
  status: LibraryImportStatus | null;
  errors: LibraryImportRecordError[];
  auditId: string | null;
}

export interface LibraryImportImportResult {
  fingerprint: string;
  summary: {
    create: number;
    update: number;
    skip: number;
    error: number;
  };
  records: LibraryImportImportRecord[];
  warnings: string[];
}

export async function importLibraryImport(
  envelope: LibraryImportEnvelope,
  fingerprint: string,
  stateFingerprint: string,
  auth: AuthContext | null,
  meta: RequestMeta,
): Promise<LibraryImportImportResult> {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }

  const plan = await buildLibraryImportPlan(envelope);

  if (plan.fingerprint !== fingerprint) {
    throw new AppError(
      409,
      'FINGERPRINT_MISMATCH',
      'El archivo cambió entre la vista previa y la importación; vuelve a validarlo',
    );
  }

  if (plan.stateFingerprint !== stateFingerprint) {
    throw new AppError(
      409,
      'IMPORT_PREVIEW_STALE',
      'La biblioteca cambió entre la vista previa y la importación; vuelve a validarlo',
    );
  }

  const applyable = plan.records.filter((entry) => needsWrite(entry));
  const auditIds = new Map<number, string>();
  const baseGameIds = new Map<number, string>();
  const warnings: string[] = [];
  const touchedSlugs = unique(
    plan.records.flatMap((entry) => (entry.slug ? [entry.slug] : [])),
  );

  if (applyable.length > 0) {
    const prisma = getPrisma();
    await prisma.$transaction(
      async (tx) => {
        const insideState = stateFingerprintOf(await loadLibraryState(tx, touchedSlugs));
        if (insideState !== plan.stateFingerprint) {
          throw new AppError(
            409,
            'IMPORT_PREVIEW_STALE',
            'La biblioteca cambió mientras se aplicaba el lote; no se ha escrito nada',
          );
        }

        for (const entry of applyable) {
          const applied = await applyEntry(tx, entry, auth, meta, envelope);
          auditIds.set(entry.index, applied.auditId);
          baseGameIds.set(entry.index, applied.baseGameId);
        }
      },
      { maxWait: 10_000, timeout: 120_000 },
    );
  }

  const downgraded = new Set<number>();

  for (const entry of plan.records) {
    const coverUrl = entry.record?.coverUrl;
    if (!coverUrl) continue;

    const baseGameId =
      baseGameIds.get(entry.index) ?? (await resolveBaseGameId(entry));

    if (!baseGameId) continue;
    if (await hasUsableCover(baseGameId)) continue;

    const outcome = await syncCover({ slug: String(entry.slug), baseGameId, coverUrl });

    if (outcome.status === 'OK') continue;

    downgraded.add(entry.index);
    warnings.push(
      `Portada no importada de "${entry.slug}" (${outcome.detail ?? 'ERROR'}): el juego queda sin imagen y en estado INCOMPLETE; se reintentará en la siguiente importación.`,
    );
  }

  await syncCatalogCopies(touchedSlugs, auth, meta, warnings);

  const summary = { create: 0, update: 0, skip: 0, error: 0 };

  const records = plan.records.map((entry) => {
    const action = needsWrite(entry) || entry.action === 'error' ? entry.action : 'skip';
    summary[action] += 1;
    return {
      index: entry.index,
      slug: entry.slug,
      action,
      status: downgraded.has(entry.index) ? 'INCOMPLETE' : entry.status,
      errors: entry.errors,
      auditId: auditIds.get(entry.index) ?? null,
    };
  });

  return { fingerprint: plan.fingerprint, summary, records, warnings };
}

async function resolveBaseGameId(entry: LibraryImportPlanRecord): Promise<string | null> {
  if (entry.existingId) return entry.existingId;
  if (!entry.slug) return null;

  const prisma = getPrisma();
  const row = await prisma.baseGame.findFirst({ where: { slug: entry.slug } });

  return row?.id ?? null;
}

async function hasUsableCover(baseGameId: string): Promise<boolean> {
  const prisma = getPrisma();
  const row = await prisma.libraryMedia.findFirst({
    where: { baseGameId, kind: 'COVER', status: 'OK' },
  });

  return row !== null;
}

/**
 * El TenantGame guarda su propia copia de la descripción y de los requisitos
 * al publicar desde la biblioteca, y resolveFinal les da prioridad antes de
 * mirar la base: una reimportación que traduzca o corrija la biblioteca
 * dejaría el catálogo con el texto anterior si no se refresca esa copia.
 *
 * Se alinea únicamente lo que ya era copia (si no lo era, la resolución ya cae
 * a la base y crearla ahora robaría el sitio a la variante), solo con valor
 * presente en la biblioteca (nunca se borra texto curado) y sin tocar los
 * campos comerciales —título, tamaño, precio—, que son del catálogo.
 */
async function syncCatalogCopies(
  slugs: string[],
  auth: AuthContext | null,
  meta: RequestMeta,
  warnings: string[],
): Promise<void> {
  if (!slugs.length) return;
  const prisma = getPrisma();

  const biblioteca = await chunkedQuery(slugs, (chunk) =>
    prisma.baseGame.findMany({ where: { slug: { in: chunk }, deletedAt: null } }),
  );
  if (!biblioteca.length) return;

  const porId = new Map(biblioteca.map((fila) => [fila.id, fila]));
  const ofertas = await chunkedQuery([...porId.keys()], (chunk) =>
    prisma.tenantGame.findMany({
      where: { origin: 'BIBLIOTECA', baseGameId: { in: chunk }, deletedAt: null },
    }),
  );
  if (!ofertas.length) return;

  let alineadas = 0;

  for (const oferta of ofertas) {
    const base = oferta.baseGameId ? porId.get(oferta.baseGameId) : undefined;
    if (!base) continue;

    const data: Prisma.TenantGameUncheckedUpdateInput = {};
    const campos: string[] = [];

    if (hayQueAlinear(base.description, oferta.description)) {
      data.description = base.description;
      campos.push('description');
    }
    if (hayQueAlinear(base.minimumRequirements, oferta.minimumRequirements)) {
      data.minimumRequirements = jsonValue(base.minimumRequirements);
      campos.push('minimumRequirements');
    }
    if (hayQueAlinear(base.recommendedRequirements, oferta.recommendedRequirements)) {
      data.recommendedRequirements = jsonValue(base.recommendedRequirements);
      campos.push('recommendedRequirements');
    }
    if (!campos.length) continue;

    data.updatedBy = auth?.id ?? null;

    await prisma.tenantGame.update({ where: { id: oferta.id }, data });
    await prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'UPDATE',
        entity: 'TenantGame',
        entityId: oferta.id,
        tenantId: oferta.tenantId,
        metadata: {
          slug: oferta.slug,
          schema: LIBRARY_IMPORT_SCHEMA,
          catalogSync: { baseGameId: oferta.baseGameId, fields: campos },
        },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    });

    alineadas += 1;
  }

  if (alineadas > 0) {
    warnings.push(
      `Se alinearon con la biblioteca la descripción y los requisitos de ${alineadas} ${
        alineadas === 1 ? 'juego' : 'juegos'
      } publicado${alineadas === 1 ? '' : 's'} en el catálogo.`,
    );
  }
}

/** Solo se refresca lo que ya era copia y lo que la biblioteca sigue teniendo. */
function hayQueAlinear(vigente: unknown, copia: unknown): boolean {
  if (vigente === null || vigente === undefined) return false;
  if (copia === null || copia === undefined) return false;
  return canonicalJson(vigente) !== canonicalJson(copia);
}

function needsWrite(entry: LibraryImportPlanRecord): boolean {
  if (entry.action === 'create') return true;
  if (entry.action !== 'update') return false;
  return entry.changes.some((change) => change !== 'cover');
}

async function applyEntry(
  tx: Prisma.TransactionClient,
  entry: LibraryImportPlanRecord,
  auth: AuthContext,
  meta: RequestMeta,
  envelope: LibraryImportEnvelope,
): Promise<{ auditId: string; baseGameId: string }> {
  const record = entry.record;
  if (!record) {
    throw new AppError(500, 'LIBRARY_IMPORT_RECORD_INVALID', 'Registro inválido en el plan');
  }

  const status = entry.status ?? 'INCOMPLETE';
  const baseGameId =
    entry.action === 'create'
      ? (
          await tx.baseGame.create({
            data: {
              id: randomUUID(),
              title: record.title,
              slug: record.slug,
              description: record.description ?? null,
              releaseYear: record.releaseYear ?? null,
              developer: record.developer ?? null,
              publisher: record.publisher ?? null,
              keywords: record.keywords ?? null,
              categoryId: entry.categoryId,
              sizeValue: entry.size.sizeValue,
              sizeUnit: entry.size.sizeUnit,
              status,
              source: LIBRARY_IMPORT_SCHEMA,
              minimumRequirements: jsonValue(record.minimumRequirements ?? null),
              recommendedRequirements: jsonValue(record.recommendedRequirements ?? null),
              createdBy: auth.id,
              updatedBy: auth.id,
            },
          })
        ).id
      : await updateBaseGame(tx, entry, auth);

  await syncGenres(tx, entry, baseGameId);
  await syncVariants(tx, entry, baseGameId);

  const audit = await tx.auditLog.create({
    data: auditData({
      actor: auth,
      action: entry.action === 'create' ? 'CREATE' : 'UPDATE',
      entity: 'BaseGame',
      entityId: baseGameId,
      tenantId: null,
      metadata: {
        slug: record.slug,
        action: entry.action,
        schema: LIBRARY_IMPORT_SCHEMA,
        source: envelope.source ?? null,
        status,
        changes: entry.changes,
      },
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    }),
  });

  return { auditId: audit.id, baseGameId };
}

async function updateBaseGame(
  tx: Prisma.TransactionClient,
  entry: LibraryImportPlanRecord,
  auth: AuthContext,
): Promise<string> {
  const record = entry.record;
  if (!record || !entry.existingId) {
    throw new AppError(500, 'LIBRARY_IMPORT_RECORD_INVALID', 'Registro inválido en el plan');
  }

  const data: Prisma.BaseGameUncheckedUpdateInput = {
    title: record.title,
    status: entry.status ?? 'INCOMPLETE',
    sizeValue: entry.size.sizeValue,
    sizeUnit: entry.size.sizeUnit,
    deletedAt: null,
    updatedBy: auth.id,
  };

  if (isPresentText(record.description)) data.description = record.description;
  if (isPresentText(record.developer)) data.developer = record.developer;
  if (isPresentText(record.publisher)) data.publisher = record.publisher;
  if (isPresentText(record.keywords)) data.keywords = record.keywords;
  if (record.releaseYear != null) data.releaseYear = record.releaseYear;
  if (record.categorySlug != null) data.categoryId = entry.categoryId;
  if (record.minimumRequirements != null) {
    data.minimumRequirements = jsonValue(record.minimumRequirements);
  }
  if (record.recommendedRequirements != null) {
    data.recommendedRequirements = jsonValue(record.recommendedRequirements);
  }

  const updated = await tx.baseGame.update({ where: { id: entry.existingId }, data });

  return updated.id;
}

async function syncGenres(
  tx: Prisma.TransactionClient,
  entry: LibraryImportPlanRecord,
  baseGameId: string,
): Promise<void> {
  const record = entry.record;
  if (!record) return;

  if (entry.action === 'create') {
    if (entry.genreIds.length > 0) {
      await tx.baseGameGenre.createMany({
        data: entry.genreIds.map((genreId) => ({ baseGameId, genreId })),
      });
    }
    return;
  }

  if (record.genreSlugs == null) return;

  const current = await tx.baseGameGenre.findMany({ where: { baseGameId } });
  const wanted = new Set(entry.genreIds);
  const removed = current
    .filter((link) => !wanted.has(link.genreId))
    .map((link) => link.genreId);

  if (removed.length > 0) {
    await tx.baseGameGenre.deleteMany({
      where: { baseGameId, genreId: { in: removed } },
    });
  }

  const present = new Set(current.map((link) => link.genreId));
  const added = entry.genreIds.filter((genreId) => !present.has(genreId));

  if (added.length > 0) {
    await tx.baseGameGenre.createMany({
      data: added.map((genreId) => ({ baseGameId, genreId })),
    });
  }
}

async function syncVariants(
  tx: Prisma.TransactionClient,
  entry: LibraryImportPlanRecord,
  baseGameId: string,
): Promise<void> {
  for (const variant of entry.variants) {
    if (!variant.platformId) {
      throw new AppError(
        500,
        'LIBRARY_IMPORT_PLATFORM_UNRESOLVED',
        `No se pudo resolver la plataforma de una variante de "${entry.slug}"`,
      );
    }

    const existing = await tx.baseGamePlatform.findFirst({
      where: { baseGameId, platformId: variant.platformId },
    });

    if (!existing) {
      await tx.baseGamePlatform.createMany({
        data: [
          {
            baseGameId,
            platformId: variant.platformId,
            sizeValue: variant.sizeValue ?? null,
            sizeUnit: variant.sizeUnit ?? null,
            minimumRequirements: jsonValue(variant.minimumRequirements),
            recommendedRequirements: jsonValue(variant.recommendedRequirements),
            provenance: jsonValue(variant.provenance),
          },
        ],
      });
      continue;
    }

    const data: Prisma.BaseGamePlatformUncheckedUpdateInput = {};

    if (variant.sizeValue != null) {
      data.sizeValue = variant.sizeValue;
      data.sizeUnit = variant.sizeUnit;
    }
    if (variant.minimumRequirements != null) {
      data.minimumRequirements = jsonValue(variant.minimumRequirements);
    }
    if (variant.recommendedRequirements != null) {
      data.recommendedRequirements = jsonValue(variant.recommendedRequirements);
    }
    if (variant.provenance != null) {
      data.provenance = jsonValue(variant.provenance);
    }

    if (Object.keys(data).length > 0) {
      await tx.baseGamePlatform.update({
        where: { baseGameId_platformId: { baseGameId, platformId: variant.platformId } },
        data,
      });
    }
  }
}

interface SemanticContext {
  genreIdBySlug: Map<string, string>;
  categoryIdBySlug: Map<string, string>;
  platformIdBySlug: Map<string, string>;
}

function semanticErrors(
  record: LibraryImportRecord,
  context: SemanticContext,
): LibraryImportRecordError[] {
  const errors: LibraryImportRecordError[] = [];

  const hasRecordValue = record.sizeValue !== undefined && record.sizeValue !== null;
  const hasRecordUnit = record.sizeUnit !== undefined && record.sizeUnit !== null;
  if (hasRecordValue !== hasRecordUnit) {
    errors.push({
      code: 'SIZE_PAIR_INVALID',
      field: hasRecordValue ? 'sizeUnit' : 'sizeValue',
      message: 'sizeValue y sizeUnit deben indicarse en pareja',
    });
  }

  const seenPlatforms = new Set<string>();
  record.platformVariants.forEach((variant, index) => {
    const hasVariantValue = variant.sizeValue !== undefined && variant.sizeValue !== null;
    const hasVariantUnit = variant.sizeUnit !== undefined && variant.sizeUnit !== null;
    if (hasVariantValue !== hasVariantUnit) {
      errors.push({
        code: 'SIZE_PAIR_INVALID',
        field: `platformVariants[${index}]`,
        message: 'La variante debe indicar sizeValue y sizeUnit en pareja',
      });
    }

    if (seenPlatforms.has(variant.platformSlug)) {
      errors.push({
        code: 'PLATFORM_VARIANT_DUPLICATE',
        field: `platformVariants[${index}].platformSlug`,
        message: `Plataforma repetida en el mismo registro: ${variant.platformSlug}`,
      });
    }
    seenPlatforms.add(variant.platformSlug);

    if (!context.platformIdBySlug.has(variant.platformSlug)) {
      errors.push({
        code: 'TAXONOMY_PLATFORM_UNKNOWN',
        field: `platformVariants[${index}].platformSlug`,
        message: `Plataforma no encontrada en el diccionario global: ${variant.platformSlug}`,
      });
    }
  });

  if (record.categorySlug && !context.categoryIdBySlug.has(record.categorySlug)) {
    errors.push({
      code: 'TAXONOMY_CATEGORY_UNKNOWN',
      field: 'categorySlug',
      message: `Categoría no encontrada en el diccionario global: ${record.categorySlug}`,
    });
  }

  for (const slug of record.genreSlugs ?? []) {
    if (!context.genreIdBySlug.has(slug)) {
      errors.push({
        code: 'TAXONOMY_GENRE_UNKNOWN',
        field: 'genreSlugs',
        message: `Género no encontrado en el diccionario global: ${slug}`,
      });
    }
  }

  return errors;
}

function resolveMergedSize(
  record: LibraryImportRecord,
  existing: { sizeValue: number; sizeUnit: SizeUnitValue } | undefined,
): MergedSize {
  if (record.sizeValue !== undefined && record.sizeValue !== null && record.sizeUnit) {
    return { sizeValue: record.sizeValue, sizeUnit: record.sizeUnit };
  }

  for (const platformSlug of PLATFORM_SIZE_PRIORITY) {
    const variant = record.platformVariants.find(
      (entry) => entry.platformSlug === platformSlug && entry.sizeValue !== undefined && entry.sizeValue !== null,
    );
    if (variant?.sizeValue !== undefined && variant?.sizeValue !== null && variant.sizeUnit) {
      return { sizeValue: variant.sizeValue, sizeUnit: variant.sizeUnit };
    }
  }

  if (existing) {
    return { sizeValue: existing.sizeValue, sizeUnit: existing.sizeUnit };
  }

  return { sizeValue: 0, sizeUnit: 'GB' };
}

function isPresentText(value: string | null | undefined): value is string {
  return value != null && value.trim() !== '';
}

function deriveStatus(
  record: LibraryImportRecord,
  existing: { description: string | null } | undefined,
  size: MergedSize,
  hasCoverMedia: boolean,
): LibraryImportStatus {
  const description = isPresentText(record.description)
    ? record.description
    : (existing?.description ?? null);
  const hasDescription = isPresentText(description);
  const hasCover = record.coverUrl !== undefined && record.coverUrl !== null;
  const conditions =
    hasDescription &&
    record.platformVariants.length > 0 &&
    size.sizeValue > 0 &&
    (hasCover || hasCoverMedia);

  return conditions ? 'ACTIVE' : 'INCOMPLETE';
}

interface DiffContext {
  status: LibraryImportStatus;
  size: MergedSize;
  genreIds: Set<string>;
  genreIdsExisting: Set<string>;
  categoryId: string | null;
  variantLinks: Array<{
    platformId: string;
    sizeValue: number | null;
    sizeUnit: string | null;
    minimumRequirements: unknown;
    recommendedRequirements: unknown;
    provenance: unknown;
  }>;
  platformIdBySlug: Map<string, string>;
  hasCover: boolean;
}

function diffChanges(
  record: LibraryImportRecord,
  existing: {
    title: string;
    description: string | null;
    releaseYear: number | null;
    developer: string | null;
    publisher: string | null;
    keywords: string | null;
    categoryId: string | null;
    sizeValue: number;
    sizeUnit: SizeUnitValue;
    status: string;
    minimumRequirements: unknown;
    recommendedRequirements: unknown;
    deletedAt: Date | null;
  },
  context: DiffContext,
): string[] {
  const changes: string[] = [];

  if (record.title !== existing.title) changes.push('title');
  if (isPresentText(record.description) && record.description !== existing.description) {
    changes.push('description');
  }
  if (record.releaseYear != null && record.releaseYear !== existing.releaseYear) {
    changes.push('releaseYear');
  }
  if (isPresentText(record.developer) && record.developer !== existing.developer) {
    changes.push('developer');
  }
  if (isPresentText(record.publisher) && record.publisher !== existing.publisher) {
    changes.push('publisher');
  }
  if (isPresentText(record.keywords) && record.keywords !== existing.keywords) {
    changes.push('keywords');
  }
  if (isPresentText(record.categorySlug) && context.categoryId !== existing.categoryId) {
    changes.push('category');
  }
  if (record.genreSlugs != null && !sameSet(context.genreIds, context.genreIdsExisting)) {
    changes.push('genres');
  }

  if (
    record.minimumRequirements != null &&
    canonicalJson(record.minimumRequirements) !== canonicalJson(existing.minimumRequirements)
  ) {
    changes.push('minimumRequirements');
  }
  if (
    record.recommendedRequirements != null &&
    canonicalJson(record.recommendedRequirements) !==
      canonicalJson(existing.recommendedRequirements)
  ) {
    changes.push('recommendedRequirements');
  }

  if (context.size.sizeValue !== existing.sizeValue) changes.push('sizeValue');
  if (context.size.sizeUnit !== existing.sizeUnit) changes.push('sizeUnit');
  if (context.status !== existing.status) changes.push('status');

  if (variantsDiffer(record, context.variantLinks, context.platformIdBySlug)) {
    changes.push('platformVariants');
  }

  if (record.coverUrl != null && !context.hasCover) changes.push('cover');
  if (existing.deletedAt !== null) changes.push('deletedAt');

  return changes;
}

function variantsDiffer(
  record: LibraryImportRecord,
  links: DiffContext['variantLinks'],
  platformIdBySlug: Map<string, string>,
): boolean {
  for (const variant of record.platformVariants) {
    const platformId = platformIdBySlug.get(variant.platformSlug);
    const link = links.find((entry) => entry.platformId === platformId);

    if (!link) return true;
    if (variant.sizeValue != null && (variant.sizeValue !== link.sizeValue || variant.sizeUnit !== link.sizeUnit)) {
      return true;
    }
    if (
      variant.minimumRequirements != null &&
      canonicalJson(variant.minimumRequirements) !== canonicalJson(link.minimumRequirements)
    ) {
      return true;
    }
    if (
      variant.recommendedRequirements != null &&
      canonicalJson(variant.recommendedRequirements) !== canonicalJson(link.recommendedRequirements)
    ) {
      return true;
    }
    if (
      variant.provenance != null &&
      canonicalJson(variant.provenance) !== canonicalJson(link.provenance)
    ) {
      return true;
    }
  }

  return false;
}

function zodIssuesToErrors(error: ZodError): LibraryImportRecordError[] {
  const errors: LibraryImportRecordError[] = [];

  for (const issue of error.issues) {
    if (issue.code === 'unrecognized_keys') {
      for (const key of issue.keys) {
        errors.push({
          code: 'SCHEMA_INVALID',
          field: key,
          message: `Campo no permitido en el registro: ${key}`,
        });
      }
      continue;
    }

    errors.push({
      code: 'SCHEMA_INVALID',
      field: issue.path.join('.') || 'registro',
      message: issue.message,
    });
  }

  return errors;
}

function bestEffortSlug(raw: unknown): string | null {
  if (raw !== null && typeof raw === 'object' && 'slug' in raw) {
    const value = (raw as { slug?: unknown }).slug;
    if (typeof value === 'string') return value.trim().slice(0, SLUG_ECHO_LIMIT);
  }
  return null;
}

export function fingerprintOf(games: unknown[]): string {
  return createHash('sha256').update(canonicalJson(games), 'utf8').digest('hex');
}

export function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

async function chunkedQuery<T>(
  values: string[],
  run: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const result: T[] = [];

  for (let index = 0; index < values.length; index += QUERY_CHUNK_SIZE) {
    result.push(...(await run(values.slice(index, index + QUERY_CHUNK_SIZE))));
  }

  return result;
}

function groupRows<T extends Record<string, unknown>>(rows: T[], key: string): Map<string, T[]> {
  const result = new Map<string, T[]>();

  for (const row of rows) {
    const groupKey = String(row[key]);
    const bucket = result.get(groupKey);
    if (bucket) bucket.push(row);
    else result.set(groupKey, [row]);
  }

  return result;
}

function groupValues<T extends Record<string, unknown>>(
  rows: T[],
  key: string,
  valueKey: string,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();

  for (const row of rows) {
    const groupKey = String(row[key]);
    const set = result.get(groupKey) ?? new Set<string>();
    set.add(String(row[valueKey]));
    result.set(groupKey, set);
  }

  return result;
}