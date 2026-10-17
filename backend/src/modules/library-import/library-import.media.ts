import { randomUUID } from 'node:crypto';
import { uploadImage } from '../../config/cloudinary.js';
import { getPrisma } from '../../config/database.js';
import { safeGetImage } from '../../utils/safeUrl.js';
import { withRetry } from '../../utils/retry.js';

export const COVER_ALLOWED_HOSTS = [
  'images.igdb.com',
  'media.igdb.com',
  'steamstatic.com',
  'cdn.akamai.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'store.playstation.com',
  'media.xbox.com',
];

const COVER_MAX_BYTES = 5 * 1024 * 1024;
const COVER_TIMEOUT_MS = 10_000;
const UPLOAD_ATTEMPTS = 3;

export interface CoverCandidate {
  slug: string;
  baseGameId: string;
  coverUrl: string;
}

export interface CoverOutcome {
  status: 'OK' | 'ERROR';
  detail: string | null;
  url: string | null;
  publicId: string | null;
}

export function isAllowedCoverHost(rawUrl: string): boolean {
  let host: string;
  try {
    host = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  return COVER_ALLOWED_HOSTS.some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`),
  );
}

export function coverPublicId(slug: string): string {
  return `library/games/${slug}/cover`;
}

export async function syncCover(candidate: CoverCandidate): Promise<CoverOutcome> {
  if (!isAllowedCoverHost(candidate.coverUrl)) {
    await registerFailure(candidate.baseGameId, 'HOST_NO_PERMITIDO');
    return { status: 'ERROR', detail: 'HOST_NO_PERMITIDO', url: null, publicId: null };
  }

  const fetched = await safeGetImage(candidate.coverUrl, {
    maxBytes: COVER_MAX_BYTES,
    timeoutMs: COVER_TIMEOUT_MS,
  });

  if (fetched.result !== 'ok' || !fetched.buffer) {
    const detail = fetched.detail ?? 'DESCARGA_FALLIDA';
    await registerFailure(candidate.baseGameId, detail);
    return { status: 'ERROR', detail, url: null, publicId: null };
  }

  const buffer = fetched.buffer;
  const publicId = coverPublicId(candidate.slug);

  try {
    const uploaded = await withRetry(() => uploadImage({ buffer, publicId }), {
      attempts: UPLOAD_ATTEMPTS,
    });
    await registerSuccess(candidate.baseGameId, uploaded.url, uploaded.publicId);
    return { status: 'OK', detail: null, url: uploaded.url, publicId: uploaded.publicId };
  } catch {
    await registerFailure(candidate.baseGameId, 'SUBIDA_FALLIDA');
    return { status: 'ERROR', detail: 'SUBIDA_FALLIDA', url: null, publicId: null };
  }
}

async function registerSuccess(
  baseGameId: string,
  url: string,
  publicId: string,
): Promise<void> {
  const prisma = getPrisma();
  const existing = await prisma.libraryMedia.findFirst({
    where: { baseGameId, kind: 'COVER' },
  });

  if (existing) {
    await prisma.libraryMedia.update({
      where: { id: existing.id },
      data: { url, publicId, status: 'OK' },
    });
    return;
  }

  await prisma.libraryMedia.create({
    data: { id: randomUUID(), baseGameId, kind: 'COVER', sortOrder: 0, url, publicId, status: 'OK' },
  });
}

async function registerFailure(baseGameId: string, _detail: string): Promise<void> {
  const prisma = getPrisma();
  const existing = await prisma.libraryMedia.findFirst({
    where: { baseGameId, kind: 'COVER' },
  });

  if (existing) {
    await prisma.libraryMedia.update({
      where: { id: existing.id },
      data: { url: null, publicId: null, status: 'ERROR' },
    });
  } else {
    await prisma.libraryMedia.create({
      data: {
        id: randomUUID(),
        baseGameId,
        kind: 'COVER',
        sortOrder: 0,
        url: null,
        publicId: null,
        status: 'ERROR',
      },
    });
  }

  const game = await prisma.baseGame.findFirst({ where: { id: baseGameId } });
  if (game?.status === 'ACTIVE') {
    await prisma.baseGame.update({ where: { id: baseGameId }, data: { status: 'INCOMPLETE' } });
  }
}