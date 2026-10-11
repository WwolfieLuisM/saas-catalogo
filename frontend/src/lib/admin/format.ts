export function rel(ts: number | string, now: number = Date.now()): string {
  const time = typeof ts === 'string' ? Date.parse(ts) : ts;
  const m = Math.max(0, Math.round((now - time) / 60000));
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export function dt(ts: number | string | Date): string {
  return new Date(ts).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' });
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function shortId(value: string | null | undefined): string {
  return value ? value.slice(0, 8) : '';
}

export function nf(value: number): string {
  return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function hue(value: string): number {
  return [...String(value)].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) % 360, 7);
}

export function ini(value: string): string {
  return (
    String(value)
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || '?'
  );
}
