import { adminFetch } from './adminApi.ts';
import type { MediaManifest } from './types.ts';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_RE = /^image\/(jpeg|png|webp)$/;

export function validateImageFile(file: File): string | null {
  if (!IMAGE_RE.test(file.type)) return 'Formato no permitido. Usa JPG, PNG o WebP.';
  if (file.size > MAX_IMAGE_BYTES) return 'La imagen supera 8 MB.';
  return null;
}

export function fetchMediaManifest(gameId: string): Promise<MediaManifest> {
  return adminFetch<MediaManifest>(`/admin/games/${gameId}/media/manifest`);
}

function mediaForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

export function uploadGameCover(gameId: string, file: File): Promise<unknown> {
  return adminFetch(`/admin/games/${gameId}/cover`, { method: 'POST', body: mediaForm(file) });
}

export function deleteGameCover(gameId: string): Promise<unknown> {
  return adminFetch(`/admin/games/${gameId}/cover`, { method: 'DELETE' });
}

export function uploadGameShot(gameId: string, file: File): Promise<unknown> {
  return adminFetch(`/admin/games/${gameId}/screenshots`, {
    method: 'POST',
    body: mediaForm(file),
  });
}

export function deleteGameShot(gameId: string, shotId: string): Promise<unknown> {
  return adminFetch(`/admin/games/${gameId}/screenshots/${shotId}`, { method: 'DELETE' });
}
