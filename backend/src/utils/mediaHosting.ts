export type MediaHosting = 'cloudinary' | 'external' | 'unknown';

export interface MediaHostingInfo {
  hosting: MediaHosting;
  provider: string | null;
}

export function describeMediaHosting(
  url: string | null,
  publicId: string | null,
): MediaHostingInfo {
  if (publicId) {
    return { hosting: 'cloudinary', provider: 'cloudinary' };
  }
  if (!url) {
    return { hosting: 'unknown', provider: null };
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return { hosting: 'unknown', provider: null };
  }
  if (hostname.endsWith('cloudinary.com')) {
    return { hosting: 'cloudinary', provider: 'cloudinary' };
  }
  const labels = hostname.split('.');
  const provider =
    labels.length >= 2
      ? (labels[labels.length - 2] ?? hostname)
      : (labels[0] ?? hostname);
  return { hosting: 'external', provider };
}

export function mediaUrlPatternKey(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    segments.pop();
    const path = segments.length > 0 ? `/${segments.join('/')}` : '';
    return `${parsed.protocol}//${parsed.hostname}${path}`.toLowerCase();
  } catch {
    return null;
  }
}
