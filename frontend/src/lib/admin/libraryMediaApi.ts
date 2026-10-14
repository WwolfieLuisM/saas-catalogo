import { adminFetch } from './adminApi.ts';
import type { LibraryMediaEntry } from './types.ts';

function mediaForm(file: File): FormData {
  const form = new FormData();
  form.append('file', file);
  return form;
}

export function fetchLibraryMedia(baseGameId: string): Promise<LibraryMediaEntry[]> {
  return adminFetch<LibraryMediaEntry[]>(`/admin/base-games/${baseGameId}/media`);
}

export function uploadLibraryCover(baseGameId: string, file: File): Promise<unknown> {
  return adminFetch(`/admin/base-games/${baseGameId}/media/cover`, {
    method: 'POST',
    body: mediaForm(file),
  });
}

export function deleteLibraryCover(baseGameId: string): Promise<unknown> {
  return adminFetch(`/admin/base-games/${baseGameId}/media/cover`, { method: 'DELETE' });
}

export function uploadLibraryShot(baseGameId: string, file: File): Promise<unknown> {
  return adminFetch(`/admin/base-games/${baseGameId}/media/screenshots`, {
    method: 'POST',
    body: mediaForm(file),
  });
}

export function deleteLibraryShot(baseGameId: string, mediaId: string): Promise<unknown> {
  return adminFetch(`/admin/base-games/${baseGameId}/media/screenshots/${mediaId}`, {
    method: 'DELETE',
  });
}
