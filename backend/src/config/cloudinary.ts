import { createHash } from 'node:crypto';
import { getEnv } from './env.js';

export interface CloudinaryUploadInput {
  buffer: Buffer;
  publicId: string;
}

export interface CloudinaryUploadResult {
  url: string;
  publicId: string;
}

function apiBase(): string {
  return `https://api.cloudinary.com/v1_1/${getEnv().CLOUDINARY_CLOUD_NAME}`;
}

function buildSignature(params: Record<string, string>): string {
  const secret = getEnv().CLOUDINARY_API_SECRET;
  const message = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return createHash('sha1')
    .update(message + secret)
    .digest('hex');
}

function basicAuth(): string {
  const env = getEnv();
  return `Basic ${Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64')}`;
}

export async function uploadImage(input: CloudinaryUploadInput): Promise<CloudinaryUploadResult> {
  const env = getEnv();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signable = { overwrite: 'true', public_id: input.publicId, timestamp };

  const form = new FormData();
  form.set('file', `data:image/jpeg;base64,${input.buffer.toString('base64')}`);
  form.set('api_key', env.CLOUDINARY_API_KEY);
  form.set('public_id', input.publicId);
  form.set('overwrite', 'true');
  form.set('timestamp', timestamp);
  form.set('signature', buildSignature(signable));

  const response = await fetch(`${apiBase()}/image/upload`, { method: 'POST', body: form });
  const payload = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    error?: { message?: string };
  };

  if (!response.ok || !payload.secure_url || !payload.public_id) {
    throw new Error(
      payload.error?.message ?? `Cloudinary upload falló con estado ${response.status}`,
    );
  }

  return { url: payload.secure_url, publicId: payload.public_id };
}

export async function destroyImage(publicId: string): Promise<void> {
  const env = getEnv();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signable = { public_id: publicId, timestamp };

  const body = new URLSearchParams({
    public_id: publicId,
    timestamp,
    api_key: env.CLOUDINARY_API_KEY,
    signature: buildSignature(signable),
  });

  const response = await fetch(`${apiBase()}/image/destroy`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = (await response.json()) as { result?: string; error?: { message?: string } };

  if (!response.ok || (payload.result !== 'ok' && payload.result !== 'not found')) {
    throw new Error(payload.error?.message ?? 'Cloudinary destroy falló');
  }
}

export async function listImages(prefix: string): Promise<string[]> {
  const ids: string[] = [];
  let nextCursor: string | undefined;

  do {
    const url = new URL(`${apiBase()}/resources`);
    url.searchParams.set('type', 'upload');
    url.searchParams.set('prefix', prefix);
    url.searchParams.set('max_results', '500');
    if (nextCursor) url.searchParams.set('next_cursor', nextCursor);

    const response = await fetch(url, { headers: { authorization: basicAuth() } });
    const payload = (await response.json()) as {
      resources?: { public_id: string }[];
      next_cursor?: string;
      error?: { message?: string };
    };

    if (!response.ok || !Array.isArray(payload.resources)) {
      throw new Error(payload.error?.message ?? 'Cloudinary list falló');
    }

    ids.push(...payload.resources.map((resource) => resource.public_id));
    nextCursor = payload.next_cursor;
  } while (nextCursor);

  return ids;
}
