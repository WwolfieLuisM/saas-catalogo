import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { getPrisma } from '../../config/database.js';
import {
  destroyImage,
  listImages,
  uploadImage,
  type CloudinaryUploadResult,
} from '../../config/cloudinary.js';
import type { AuthContext } from '../../middleware/auth.js';
import { MAX_IMAGE_BYTES, type UploadedImage } from '../../middleware/upload.js';
import type { GameMedia, Prisma, TenantGame } from '../../generated/client.js';
import { AppError } from '../../utils/appError.js';
import { withRetry } from '../../utils/retry.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import { planCatalogBump } from '../catalog/catalog.service.js';
import { resolveTenantId } from '../games/games.service.js';
import type { MediaListQuery, MediaScanQuery, ReorderScreenshotsInput } from './media.schemas.js';

const MAX_SHOTS = 4;
const UPLOAD_ATTEMPTS = 3;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

export function mediaDto(row: GameMedia) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    gameId: row.gameId,
    kind: row.kind,
    url: row.url,
    publicId: row.publicId,
    sortOrder: row.sortOrder,
    status: row.status,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function assertValidImage(file: UploadedImage | undefined): asserts file is UploadedImage {
  if (!file || file.buffer.length === 0) {
    throw new AppError(422, 'MEDIA_FILE_REQUIRED', 'La imagen es obligatoria (campo "file")');
  }
  const ext = extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME.includes(file.mimetype) || !ALLOWED_EXT.includes(ext)) {
    throw new AppError(422, 'MEDIA_INVALID_TYPE', 'Formato no permitido. Usa JPG, PNG o WebP');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new AppError(422, 'MEDIA_FILE_TOO_LARGE', 'La imagen supera el límite de 8 MB');
  }
}

async function loadGame(gameId: string, auth: AuthContext | null): Promise<TenantGame> {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }
  const prisma = getPrisma();
  const row = await prisma.tenantGame.findFirst({ where: { id: gameId, deletedAt: null } });
  if (!row) {
    throw new AppError(404, 'GAME_NOT_FOUND', 'Juego no encontrado');
  }
  if (auth.role === 'ADMIN' && row.tenantId !== auth.tenantId) {
    throw new AppError(404, 'GAME_NOT_FOUND', 'Juego no encontrado');
  }
  return row;
}

function publicIdFor(game: TenantGame, kind: 'COVER' | 'SHOT', sortOrder: number): string {
  const suffix = kind === 'COVER' ? 'cover' : `shot-${sortOrder + 1}`;
  return `tenants/${game.tenantId}/games/${game.slug}/${suffix}`;
}

async function uploadWithRetry(buffer: Buffer, publicId: string): Promise<CloudinaryUploadResult> {
  return withRetry(() => uploadImage({ buffer, publicId }), { attempts: UPLOAD_ATTEMPTS });
}

function uploadFailedError(): AppError {
  return new AppError(
    502,
    'MEDIA_UPLOAD_FAILED',
    'No se pudo subir la imagen tras varios intentos',
    {
      attempts: UPLOAD_ATTEMPTS,
    },
  );
}

export async function uploadCover(
  gameId: string,
  file: UploadedImage | undefined,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  assertValidImage(file);
  const game = await loadGame(gameId, auth);
  const prisma = getPrisma();
  const existing = await prisma.gameMedia.findFirst({
    where: { tenantId: game.tenantId, gameId: game.id, kind: 'COVER' },
  });
  const previous = existing ? { status: existing.status, publicId: existing.publicId } : null;
  const publicId = publicIdFor(game, 'COVER', 0);

  let uploaded: CloudinaryUploadResult;
  try {
    uploaded = await uploadWithRetry(file.buffer, publicId);
  } catch {
    if (!existing) {
      await prisma.gameMedia
        .create({
          data: {
            id: randomUUID(),
            tenantId: game.tenantId,
            gameId: game.id,
            kind: 'COVER',
            url: null,
            publicId: null,
            sortOrder: 0,
            status: 'ERROR',
            createdBy: auth?.id ?? null,
          },
        })
        .catch(() => undefined);
    }
    throw uploadFailedError();
  }

  try {
    const id = existing?.id ?? randomUUID();
    const createData: Prisma.GameMediaUncheckedCreateInput = {
      id,
      tenantId: game.tenantId,
      gameId: game.id,
      kind: 'COVER',
      url: uploaded.url,
      publicId: uploaded.publicId,
      sortOrder: 0,
      status: 'OK',
      createdBy: auth?.id ?? null,
    };
    const ops: Prisma.PrismaPromise<unknown>[] = [
      existing
        ? prisma.gameMedia.update({
            where: { id: existing.id },
            data: { url: uploaded.url, publicId: uploaded.publicId, status: 'OK' },
          })
        : prisma.gameMedia.create({ data: createData }),
      prisma.auditLog.create({
        data: auditData({
          actor: auth,
          action: 'MEDIA_UPLOADED',
          entity: 'GameMedia',
          entityId: id,
          tenantId: game.tenantId,
          metadata: {
            kind: 'COVER',
            gameId: game.id,
            replaced: previous !== null && previous.status === 'OK',
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }),
      }),
    ];

    if (game.availability) {
      ops.push((await planCatalogBump(game.tenantId)).op);
    }

    const [row] = (await prisma.$transaction(ops)) as [GameMedia, ...unknown[]];

    if (
      previous &&
      previous.status === 'OK' &&
      previous.publicId &&
      previous.publicId !== uploaded.publicId
    ) {
      await destroyImage(previous.publicId).catch(() => undefined);
    }

    return row;
  } catch (error) {
    if (!existing) {
      await destroyImage(uploaded.publicId).catch(() => undefined);
    }
    throw error;
  }
}

export async function uploadScreenshot(
  gameId: string,
  file: UploadedImage | undefined,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  assertValidImage(file);
  const game = await loadGame(gameId, auth);
  const prisma = getPrisma();
  const shots = await prisma.gameMedia.findMany({
    where: { tenantId: game.tenantId, gameId: game.id, kind: 'SHOT' },
    orderBy: { sortOrder: 'asc' },
  });

  const errorSlot = shots.find((row) => row.status === 'ERROR');
  let sortOrder: number;

  if (errorSlot) {
    sortOrder = errorSlot.sortOrder;
  } else {
    if (shots.length >= MAX_SHOTS) {
      throw new AppError(
        422,
        'MEDIA_LIMIT',
        'No se permite una quinta captura; elimina una captura primero',
      );
    }
    const used = new Set(shots.map((row) => row.sortOrder));
    sortOrder = 0;
    while (used.has(sortOrder)) sortOrder += 1;
  }

  const publicId = publicIdFor(game, 'SHOT', sortOrder);

  let uploaded: CloudinaryUploadResult;
  try {
    uploaded = await uploadWithRetry(file.buffer, publicId);
  } catch {
    if (!errorSlot) {
      await prisma.gameMedia
        .create({
          data: {
            id: randomUUID(),
            tenantId: game.tenantId,
            gameId: game.id,
            kind: 'SHOT',
            url: null,
            publicId: null,
            sortOrder,
            status: 'ERROR',
            createdBy: auth?.id ?? null,
          },
        })
        .catch(() => undefined);
    }
    throw uploadFailedError();
  }

  try {
    const id = errorSlot?.id ?? randomUUID();
    const createData: Prisma.GameMediaUncheckedCreateInput = {
      id,
      tenantId: game.tenantId,
      gameId: game.id,
      kind: 'SHOT',
      url: uploaded.url,
      publicId: uploaded.publicId,
      sortOrder,
      status: 'OK',
      createdBy: auth?.id ?? null,
    };
    const ops: Prisma.PrismaPromise<unknown>[] = [
      errorSlot
        ? prisma.gameMedia.update({
            where: { id: errorSlot.id },
            data: { url: uploaded.url, publicId: uploaded.publicId, status: 'OK' },
          })
        : prisma.gameMedia.create({ data: createData }),
      prisma.auditLog.create({
        data: auditData({
          actor: auth,
          action: 'MEDIA_UPLOADED',
          entity: 'GameMedia',
          entityId: id,
          tenantId: game.tenantId,
          metadata: { kind: 'SHOT', gameId: game.id, sortOrder },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }),
      }),
    ];

    if (game.availability) {
      ops.push((await planCatalogBump(game.tenantId)).op);
    }

    const [row] = (await prisma.$transaction(ops)) as [GameMedia, ...unknown[]];
    return row;
  } catch (error) {
    if (!errorSlot) {
      await destroyImage(uploaded.publicId).catch(() => undefined);
    }
    throw error;
  }
}

export async function deleteCover(gameId: string, auth: AuthContext | null, meta: RequestMeta) {
  const game = await loadGame(gameId, auth);
  const prisma = getPrisma();
  const row = await prisma.gameMedia.findFirst({
    where: { tenantId: game.tenantId, gameId: game.id, kind: 'COVER' },
  });
  if (!row) {
    throw new AppError(404, 'MEDIA_NOT_FOUND', 'Portada no encontrada');
  }

  if (row.publicId) {
    try {
      await destroyImage(row.publicId);
    } catch {
      throw new AppError(502, 'MEDIA_DELETE_FAILED', 'No se pudo eliminar la imagen en Cloudinary');
    }
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.gameMedia.delete({ where: { id: row.id } }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'MEDIA_DELETED',
        entity: 'GameMedia',
        entityId: row.id,
        tenantId: game.tenantId,
        metadata: { kind: 'COVER', gameId: game.id },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ];

  if (game.availability && row.status === 'OK') {
    ops.push((await planCatalogBump(game.tenantId)).op);
  }

  await prisma.$transaction(ops);

  return { id: row.id };
}

export async function deleteScreenshot(
  gameId: string,
  screenshotId: string,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  const game = await loadGame(gameId, auth);
  const prisma = getPrisma();
  const row = await prisma.gameMedia.findFirst({
    where: { id: screenshotId, tenantId: game.tenantId, gameId: game.id, kind: 'SHOT' },
  });
  if (!row) {
    throw new AppError(404, 'MEDIA_NOT_FOUND', 'Captura no encontrada');
  }

  if (row.publicId) {
    try {
      await destroyImage(row.publicId);
    } catch {
      throw new AppError(502, 'MEDIA_DELETE_FAILED', 'No se pudo eliminar la imagen en Cloudinary');
    }
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.gameMedia.delete({ where: { id: row.id } }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'MEDIA_DELETED',
        entity: 'GameMedia',
        entityId: row.id,
        tenantId: game.tenantId,
        metadata: { kind: 'SHOT', gameId: game.id, sortOrder: row.sortOrder },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ];

  if (game.availability && row.status === 'OK') {
    ops.push((await planCatalogBump(game.tenantId)).op);
  }

  await prisma.$transaction(ops);

  return { id: row.id };
}

export async function reorderScreenshots(
  gameId: string,
  input: ReorderScreenshotsInput,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  const game = await loadGame(gameId, auth);
  const prisma = getPrisma();
  const shots = await prisma.gameMedia.findMany({
    where: { tenantId: game.tenantId, gameId: game.id, kind: 'SHOT' },
  });

  const currentIds = new Set(shots.map((row) => row.id));
  const inputIds = input.order;
  const uniqueIds = new Set(inputIds);
  if (
    inputIds.length !== currentIds.size ||
    uniqueIds.size !== inputIds.length ||
    inputIds.some((id) => !currentIds.has(id))
  ) {
    throw new AppError(
      422,
      'MEDIA_REORDER_INVALID',
      'El orden debe incluir exactamente las capturas actuales del juego',
    );
  }

  const byId = new Map(shots.map((row) => [row.id, row]));
  const rewritten = inputIds.map((id, index) => {
    const row = byId.get(id) as GameMedia;
    return {
      id: row.id,
      tenantId: row.tenantId,
      gameId: row.gameId,
      kind: row.kind,
      url: row.url,
      publicId: row.publicId,
      sortOrder: index,
      status: row.status,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: new Date(),
    };
  });

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.gameMedia.deleteMany({ where: { id: { in: inputIds } } }),
    prisma.gameMedia.createMany({ data: rewritten }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'MEDIA_REORDERED',
        entity: 'GameMedia',
        entityId: game.id,
        tenantId: game.tenantId,
        metadata: { order: inputIds },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ];

  if (game.availability && shots.some((shot) => shot.status === 'OK')) {
    ops.push((await planCatalogBump(game.tenantId)).op);
  }

  await prisma.$transaction(ops);

  const rows = await prisma.gameMedia.findMany({
    where: { tenantId: game.tenantId, gameId: game.id, kind: 'SHOT' },
    orderBy: { sortOrder: 'asc' },
  });
  return rows.map(mediaDto);
}

export async function getMediaManifest(gameId: string, auth: AuthContext | null) {
  const game = await loadGame(gameId, auth);
  const prisma = getPrisma();
  const rows = await prisma.gameMedia.findMany({
    where: { tenantId: game.tenantId, gameId: game.id },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
  });

  const cover = rows.find((row) => row.kind === 'COVER') ?? null;
  const screenshots = rows.filter((row) => row.kind === 'SHOT');
  const counts = { total: rows.length, ok: 0, error: 0, orphan: 0, pending: 0 };
  for (const row of rows) {
    if (row.status === 'OK') counts.ok += 1;
    else if (row.status === 'ERROR') counts.error += 1;
    else if (row.status === 'ORPHAN') counts.orphan += 1;
    else counts.pending += 1;
  }

  return {
    gameId: game.id,
    slug: game.slug,
    title: game.title,
    prefix: `tenants/${game.tenantId}/games/${game.slug}`,
    cover: cover ? mediaDto(cover) : null,
    screenshots: screenshots.map(mediaDto),
    counts,
    synced: rows.every((row) => row.status === 'OK'),
  };
}

function orderByFromSort(sort: string): Prisma.GameMediaOrderByWithRelationInput {
  const direction = sort.startsWith('-') ? 'desc' : 'asc';
  const field = sort.startsWith('-') ? sort.slice(1) : sort;
  return { [field]: direction } as Prisma.GameMediaOrderByWithRelationInput;
}

export async function listMedia(query: MediaListQuery, auth: AuthContext | null) {
  const tenantId = resolveTenantId(auth, query.tenantId);
  const prisma = getPrisma();

  const where: Prisma.GameMediaWhereInput = {
    tenantId,
    ...(query.gameId ? { gameId: query.gameId } : {}),
    ...(query.status ? { status: query.status } : {}),
  };

  const rows = await prisma.gameMedia.findMany({ where, orderBy: orderByFromSort(query.sort) });
  const gameIds = [...new Set(rows.map((row) => row.gameId))];
  const games = gameIds.length
    ? await prisma.tenantGame.findMany({ where: { id: { in: gameIds } } })
    : [];
  const gameById = new Map(games.map((game) => [game.id, game]));

  const needle = query.q?.toLowerCase();
  const filtered = needle
    ? rows.filter((row) => {
        const game = gameById.get(row.gameId);
        return (
          (row.publicId?.toLowerCase().includes(needle) ?? false) ||
          game?.title.toLowerCase().includes(needle) === true ||
          game?.slug.toLowerCase().includes(needle) === true
        );
      })
    : rows;

  const total = filtered.length;
  const start = (query.page - 1) * query.limit;
  const items = filtered.slice(start, start + query.limit);

  return {
    items: items.map((row) => {
      const game = gameById.get(row.gameId);
      return {
        ...mediaDto(row),
        game: game ? { id: game.id, title: game.title, slug: game.slug } : null,
      };
    }),
    total,
  };
}

export async function scanMedia(
  query: MediaScanQuery,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  const tenantId = resolveTenantId(auth, query.tenantId);
  const prisma = getPrisma();
  const prefix = `tenants/${tenantId}/games/`;

  let cloudIds: string[];
  try {
    cloudIds = await withRetry(() => listImages(prefix), { attempts: UPLOAD_ATTEMPTS });
  } catch {
    throw new AppError(502, 'MEDIA_SCAN_FAILED', 'No se pudo listar los recursos de Cloudinary');
  }

  const rows = await prisma.gameMedia.findMany({
    where: { tenantId, status: { in: ['OK', 'ORPHAN'] } },
  });
  const cloudSet = new Set(cloudIds);
  const dbIds = new Set(rows.map((row) => row.publicId).filter((id): id is string => Boolean(id)));

  const missing = rows.filter(
    (row) => row.status === 'OK' && row.publicId !== null && !cloudSet.has(row.publicId),
  );
  const restorable = rows.filter(
    (row) => row.status === 'ORPHAN' && row.publicId !== null && cloudSet.has(row.publicId),
  );
  const assetsWithoutDb = cloudIds.filter((id) => !dbIds.has(id));

  if (missing.length > 0 || restorable.length > 0) {
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    for (const row of missing) {
      ops.push(prisma.gameMedia.update({ where: { id: row.id }, data: { status: 'ORPHAN' } }));
    }
    for (const row of restorable) {
      ops.push(prisma.gameMedia.update({ where: { id: row.id }, data: { status: 'OK' } }));
    }
    ops.push(
      prisma.auditLog.create({
        data: auditData({
          actor: auth,
          action: 'MEDIA_SCAN',
          entity: 'GameMedia',
          tenantId,
          metadata: {
            markedOrphan: missing.length,
            restored: restorable.length,
            assetsWithoutDb: assetsWithoutDb.length,
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }),
      }),
    );

    const affectedIds = [...new Set([...missing, ...restorable].map((row) => row.gameId))];
    const visibleGames = await prisma.tenantGame.findMany({
      where: { id: { in: affectedIds }, availability: true, deletedAt: null },
      select: { id: true },
    });
    if (visibleGames.length > 0) {
      ops.push((await planCatalogBump(tenantId)).op);
    }

    await prisma.$transaction(ops);
  }

  return {
    cloudAssets: cloudIds.length,
    dbRows: rows.length,
    markedOrphan: missing.length,
    restored: restorable.length,
    assetsWithoutDb,
    orphans: missing.map(mediaDto),
  };
}
