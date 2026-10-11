export const fmt = (n: number): string => Number(n).toLocaleString('en-US');

export const gb = (n: number): string =>
  (Math.round(n * 10) / 10).toLocaleString('en-US');

export const plural = (n: number, singular: string, pluralWord: string): string =>
  `${n} ${n === 1 ? singular : pluralWord}`;

export const norm = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export const safeUrl = (u: unknown): string =>
  typeof u === 'string' && /^(https?:\/\/|\/)/i.test(u.trim()) ? u.trim() : '';

export const hue = (id: string): number => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 360;
};

export const gradientFor = (h: number): string =>
  `linear-gradient(160deg,hsl(${h} 35% 10%),hsl(${(h + 28) % 360} 55% 28%) 55%,hsl(${(h + 52) % 360} 70% 42%))`;

export const markFor = (name: string): string => {
  const words = name.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑ ]/gi, ' ').trim().split(/\s+/);
  const nums = (name.match(/\d+/) ?? [''])[0];
  return nums || (words.at(-1) || 'PC').slice(0, 3).toUpperCase();
};

export const formatRequirements = (v: unknown): string => {
  if (!v) return 'No especificados en el catálogo.';
  if (typeof v === 'string') return v.trim() || 'No especificados en el catálogo.';
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === 'string') return x;
        const obj = x as { label?: string; name?: string; value?: string; text?: string };
        return `${obj.label || obj.name || ''}: ${obj.value || obj.text || ''}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof v === 'object') {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${typeof val === 'string' ? val : JSON.stringify(val)}`)
      .join('\n');
  }
  return String(v);
};

export const formatReleaseInfo = (
  releaseDate: string | null,
  soon: boolean,
): { date: string; days: number | null } | null => {
  if (!soon) return null;
  if (!releaseDate) return { date: '', days: null };
  const d = new Date(`${releaseDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { date: '', days: null };
  return {
    date: d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }),
    days: Math.ceil((d.getTime() - Date.now()) / 864e5),
  };
};
