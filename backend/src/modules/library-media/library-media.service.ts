import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { getPrisma } from '../../config/database.js';
import {
  destroyImage,
  uploadImage,
  type CloudinaryUploadResult,
} from '../../config/cloudinary.js';
import type { AuthContext } from '../../middleware/auth.js';
import { MAX_IMAGE_BYTES, type UploadedImage } from '../../middleware/upload.js';
import type { BaseGame, LibraryMedia, Prisma } from '../../generated/client.js';
import { AppError } from '../../utils/appError.js';
import { withRetry } from '../../utils/retry.js';
import type { RequestMeta } from '../../utils/requestMeta.js';
import { auditData } from '../audit/audit.service.js';
import type { ReorderLibraryShotsInput } from './library-media.schemas.js';

const MAX_SHOTS = 4;
const UPLOAD_ATTEMPTS = 3;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

export function libraryMediaDto(row: LibraryMedia) {
  return {
    id: row.id,
    baseGameId: row.baseGameId,
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

async function loadBaseGame(baseGameId: string): Promise<BaseGame> {
  const prisma = getPrisma();
  const row = await prisma.baseGame.findFirst({ where: { id: baseGameId, deletedAt: null } });
  if (!row) {
    throw new AppError(404, 'BASE_GAME_NOT_FOUND', 'Juego de biblioteca no encontrado');
  }
  return row;
}

function publicIdFor(game: BaseGame, kind: 'COVER' | 'SHOT', sortOrder: number): string {
  const suffix = kind === 'COVER' ? 'cover' : `shot-${sortOrder + 1}`;
  return `library/games/${game.slug}/${suffix}`;
}

async function uploadWithRetry(buffer: Buffer, publicId: string): Promise<CloudinaryUploadResult> {
  return withRetry(() => uploadImage({ buffer, publicId }), { attempts: UPLOAD_ATTEMPTS });
}

function uploadFailedError(): AppError {
  return new AppError(
    502,
    'MEDIA_UPLOAD_FAILED',
    'No se pudo subir la imagen tras varios intentos',
    { attempts: UPLOAD_ATTEMPTS },
  );
}

export async function listLibraryMedia(baseGameId: string) {
  const prisma = getPrisma();
  await loadBaseGame(baseGameId);
  const rows = await prisma.libraryMedia.findMany({
    where: { baseGameId },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }],
  });

  return rows.map(libraryMediaDto);
}

export async function uploadLibraryCover(
  baseGameId: string,
  file: UploadedImage | undefined,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }
  assertValidImage(file);
  const game = await loadBaseGame(baseGameId);
  const prisma = getPrisma();
  const existing = await prisma.libraryMedia.findFirst({
    where: { baseGameId: game.id, kind: 'COVER' },
  });
  const previous = existing ? { status: existing.status, publicId: existing.publicId } : null;
  const publicId = publicIdFor(game, 'COVER', 0);

  let uploaded: CloudinaryUploadResult;
  try {
    uploaded = await uploadWithRetry(file.buffer, publicId);
  } catch {
    if (!existing) {
      await prisma.libraryMedia
        .create({
          data: {
            id: randomUUID(),
            baseGameId: game.id,
            kind: 'COVER',
            url: null,
            publicId: null,
            sortOrder: 0,
            status: 'ERROR',
            createdBy: auth.id,
          },
        })
        .catch(() => undefined);
    }
    throw uploadFailedError();
  }

  try {
    const id = existing?.id ?? randomUUID();
    const ops: Prisma.PrismaPromise<unknown>[] = [
      existing
        ? prisma.libraryMedia.update({
            where: { id: existing.id },
            data: { url: uploaded.url, publicId: uploaded.publicId, status: 'OK' },
          })
        : prisma.libraryMedia.create({
            data: {
              id,
              baseGameId: game.id,
              kind: 'COVER',
              url: uploaded.url,
              publicId: uploaded.publicId,
              sortOrder: 0,
              status: 'OK',
              createdBy: auth.id,
            },
          }),
      prisma.auditLog.create({
        data: auditData({
          actor: auth,
          action: 'MEDIA_UPLOADED',
          entity: 'LibraryMedia',
          entityId: id,
          tenantId: null,
          metadata: {
            kind: 'COVER',
            baseGameId: game.id,
            replaced: previous !== null && previous.status === 'OK',
          },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }),
      }),
    ];

    const [row] = (await prisma.$transaction(ops)) as [LibraryMedia, ...unknown[]];

    if (
      previous &&
      previous.status === 'OK' &&
      previous.publicId &&
      previous.publicId !== uploaded.publicId
    ) {
      await destroyImage(previous.publicId).catch(() => undefined);
    }

    return libraryMediaDto(row);
  } catch (error) {
    if (!existing) {
      await destroyImage(uploaded.publicId).catch(() => undefined);
    }
    throw error;
  }
}

export async function deleteLibraryCover(
  baseGameId: string,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }
  const game = await loadBaseGame(baseGameId);
  const prisma = getPrisma();
  const existing = await prisma.libraryMedia.findFirst({
    where: { baseGameId: game.id, kind: 'COVER' },
  });
  if (!existing) {
    throw new AppError(404, 'MEDIA_NOT_FOUND', 'La portada no existe');
  }

  const [deleted] = (await prisma.$transaction([
    prisma.libraryMedia.delete({ where: { id: existing.id } }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'MEDIA_DELETED',
        entity: 'LibraryMedia',
        entityId: existing.id,
        tenantId: null,
        metadata: { kind: 'COVER', baseGameId: game.id },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ])) as [LibraryMedia, ...unknown[]];

  if (deleted.status === 'OK' && deleted.publicId) {
    await destroyImage(deleted.publicId).catch(() => undefined);
  }

  return libraryMediaDto(deleted);
}

export async function uploadLibraryScreenshot(
  baseGameId: string,
  file: UploadedImage | undefined,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }
  assertValidImage(file);
  const game = await loadBaseGame(baseGameId);
  const prisma = getPrisma();
  const shots = await prisma.libraryMedia.findMany({
    where: { baseGameId: game.id, kind: 'SHOT' },
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
      await prisma.libraryMedia
        .create({
          data: {
            id: randomUUID(),
            baseGameId: game.id,
            kind: 'SHOT',
            url: null,
            publicId: null,
            sortOrder,
            status: 'ERROR',
            createdBy: auth.id,
          },
        })
        .catch(() => undefined);
    }
    throw uploadFailedError();
  }

  try {
    const id = errorSlot?.id ?? randomUUID();
    const ops: Prisma.PrismaPromise<unknown>[] = [
      errorSlot
        ? prisma.libraryMedia.update({
            where: { id: errorSlot.id },
            data: { url: uploaded.url, publicId: uploaded.publicId, status: 'OK' },
          })
        : prisma.libraryMedia.create({
            data: {
              id,
              baseGameId: game.id,
              kind: 'SHOT',
              url: uploaded.url,
              publicId: uploaded.publicId,
              sortOrder,
              status: 'OK',
              createdBy: auth.id,
            },
          }),
      prisma.auditLog.create({
        data: auditData({
          actor: auth,
          action: 'MEDIA_UPLOADED',
          entity: 'LibraryMedia',
          entityId: id,
          tenantId: null,
          metadata: { kind: 'SHOT', baseGameId: game.id, sortOrder },
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
        }),
      }),
    ];

    const [row] = (await prisma.$transaction(ops)) as [LibraryMedia, ...unknown[]];
    return libraryMediaDto(row);
  } catch (error) {
    if (!errorSlot) {
      await destroyImage(uploaded.publicId).catch(() => undefined);
    }
    throw error;
  }
}

export async function deleteLibraryScreenshot(
  baseGameId: string,
  mediaId: string,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }
  const game = await loadBaseGame(baseGameId);
  const prisma = getPrisma();
  const existing = await prisma.libraryMedia.findFirst({
    where: { id: mediaId, baseGameId: game.id, kind: 'SHOT' },
  });
  if (!existing) {
    throw new AppError(404, 'MEDIA_NOT_FOUND', 'La captura no existe');
  }

  const [deleted] = (await prisma.$transaction([
    prisma.libraryMedia.delete({ where: { id: existing.id } }),
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'MEDIA_DELETED',
        entity: 'LibraryMedia',
        entityId: existing.id,
        tenantId: null,
        metadata: { kind: 'SHOT', baseGameId: game.id, sortOrder: existing.sortOrder },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  ])) as [LibraryMedia, ...unknown[]];

  if (deleted.status === 'OK' && deleted.publicId) {
    await destroyImage(deleted.publicId).catch(() => undefined);
  }

  return libraryMediaDto(deleted);
}

export async function reorderLibraryScreenshots(
  baseGameId: string,
  body: ReorderLibraryShotsInput,
  auth: AuthContext | null,
  meta: RequestMeta,
) {
  if (!auth) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Autenticación requerida');
  }
  const game = await loadBaseGame(baseGameId);
  const prisma = getPrisma();
  const shots = await prisma.libraryMedia.findMany({
    where: { baseGameId: game.id, kind: 'SHOT' },
  });
  const byId = new Map(shots.map((row) => [row.id, row]));
  const requested = new Set(body.order);

  if (requested.size !== body.order.length || body.order.some((id) => !byId.has(id))) {
    throw new AppError(422, 'MEDIA_REORDER_INVALID', 'El orden no corresponde a las capturas');
  }

  const ops: Prisma.PrismaPromise<unknown>[] = body.order.map((id, index) =>
    prisma.libraryMedia.update({ where: { id }, data: { sortOrder: index } }),
  );
  ops.push(
    prisma.auditLog.create({
      data: auditData({
        actor: auth,
        action: 'MEDIA_REORDERED',
        entity: 'LibraryMedia',
        entityId: game.id,
        tenantId: null,
        metadata: { baseGameId: game.id, order: body.order },
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      }),
    }),
  );

  await prisma.$transaction(ops);
  const updated = await prisma.libraryMedia.findMany({
    where: { baseGameId: game.id, kind: 'SHOT' },
    orderBy: { sortOrder: 'asc' },
  });

  return updated.map(libraryMediaDto);
}
