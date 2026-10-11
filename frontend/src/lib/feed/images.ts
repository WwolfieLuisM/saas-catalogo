import { safeUrl } from './format.ts';

const CLOUD_RE = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//;
const EXTERNAL_RE = /^https:\/\//i;

export const isCloud = (u: string): boolean => CLOUD_RE.test(u);

export const isExternal = (u: string): boolean =>
  EXTERNAL_RE.test(u) && !/steamstatic\.com|res\.cloudinary\.com/i.test(u);

export const cdn = (u: string, w: number, h: number): string => {
  if (!isCloud(u)) return u;
  return u.replace('/image/upload/', `/image/upload/f_auto,q_auto,c_fill,w_${w},h_${h}/`);
};

const IMG_PROXY = 'https://wsrv.nl/?url={url}&w={w}&h={h}&fit=cover&output=webp&q=75';

export const sized = (u: string, w: number, h: number): string => {
  if (isCloud(u)) return cdn(u, w, h);
  if (IMG_PROXY && isExternal(u)) {
    return IMG_PROXY.replace('{url}', encodeURIComponent(u)).replace('{w}', String(w)).replace('{h}', String(h));
  }
  return u;
};

const STEAM_BASES = [
  'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps',
  'https://shared.fastly.steamstatic.com/store_item_assets/steam/apps',
  'https://cdn.akamai.steamstatic.com/steam/apps',
];

const steamIdOf = (cover: string | null): string => {
  const m = /\/steam\/apps\/(\d+)\//.exec(cover ?? '');
  return m?.[1] ?? '';
};

export const imgCandidates = (g: {
  id: string;
  cover: string | null;
  banner: string | null;
}): string[] => {
  const out: string[] = [];
  const id = steamIdOf(g.cover);
  const add = (u: unknown) => {
    const s = String(u ?? '').trim();
    if (s && /^(https?:\/\/|\/|data:image\/)/i.test(s) && !out.includes(s)) out.push(s);
  };
  add(g.banner);
  const poster = id ? STEAM_BASES.map((b) => `${b}/${id}/library_600x900.jpg`) : [];
  const header = id ? STEAM_BASES.map((b) => `${b}/${id}/header.jpg`) : [];
  [...poster, ...header].forEach(add);
  if (!id) add(safeUrl(g.cover));
  return out;
};
