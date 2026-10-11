import type { PublicGame, TaxonomyRef, SizeUnit } from '@/types/catalog';
import type { FeedGame, FeedCatalog } from '@/types/feed';
import { sizeToGb } from '@/lib/catalog/mappers';
import { formatRequirements, hue, norm, safeUrl } from './format.ts';

type LooseGame = Record<string, unknown>;

const list = (v: unknown): string[] => {
  const arr = Array.isArray(v) ? v : v == null ? [] : [v];
  return arr.filter(Boolean).map(String);
};

const str = (v: unknown): string => String(v ?? '').trim();

const taxName = (t: TaxonomyRef | null | undefined): string | null => t?.name ?? null;

const toSizeGb = (raw: LooseGame): number => {
  const size = raw.size;
  if (size && typeof size === 'object') {
    const obj = size as { value?: unknown; unit?: unknown };
    return sizeToGb(Number(obj.value) || 0, (obj.unit as SizeUnit) ?? 'GB');
  }
  const flat = Number(raw.size_gb ?? raw.sizeGb ?? size) || 0;
  return Math.round(flat * 10) / 10;
};

export const normalizeGame = (raw: LooseGame): FeedGame | null => {
  const id = str(raw.id ?? raw.slug ?? raw._id);
  const name = str(raw.title ?? raw.name);
  if (!id || !name) return null;

  const sizeGb = toSizeGb(raw);

  const categoryRaw = raw.category;
  const category =
    typeof categoryRaw === 'object' && categoryRaw !== null
      ? taxName(categoryRaw as TaxonomyRef)
      : str(categoryRaw) || null;

  const genresRaw = raw.genres ?? raw.genre;
  const genres =
    Array.isArray(genresRaw) && genresRaw.length > 0 && typeof genresRaw[0] === 'object'
      ? (genresRaw as TaxonomyRef[]).map((g) => g.name).filter(Boolean)
      : list(genresRaw);

  const platformsRaw = raw.platforms ?? raw.platform;
  const platforms =
    Array.isArray(platformsRaw) && platformsRaw.length > 0 && typeof platformsRaw[0] === 'object'
      ? (platformsRaw as TaxonomyRef[]).map((p) => p.name).filter(Boolean)
      : list(platformsRaw);
  const platformsFinal = platforms.length ? platforms : ['PC'];

  const coverImageRaw = raw.coverImage;
  const coverFromApi =
    typeof coverImageRaw === 'object' && coverImageRaw !== null
      ? str((coverImageRaw as { url?: unknown }).url)
      : '';
  const cover = safeUrl(coverFromApi || (raw.cover ?? raw.coverUrl ?? raw.image ?? '')) || null;

  const banner = safeUrl(raw.banner ?? raw.bannerUrl ?? '') || null;

  const screenshotsRaw = raw.screenshots;
  const screenshots = Array.isArray(screenshotsRaw)
    ? screenshotsRaw
        .map((s) =>
          typeof s === 'object' && s !== null ? str((s as { url?: unknown }).url) : str(s),
        )
        .filter((s) => safeUrl(s))
        .slice(0, 4)
    : [];

  const requirementsRaw = raw.requirements ?? raw.systemRequirements ?? {};
  const reqObj = (
    typeof requirementsRaw === 'object' && requirementsRaw !== null ? requirementsRaw : {}
  ) as { minimum?: unknown; recommended?: unknown };

  const minRequirementsRaw = raw.minRequirements ?? raw.minimumRequirements ?? reqObj.minimum;
  const recommendedRequirementsRaw = raw.recommendedRequirements ?? reqObj.recommended;

  const addedAt = str(raw.addedAt ?? raw.createdAt ?? '') || null;
  const releaseDate = str(raw.releaseDate ?? '') || null;
  const hueRaw = raw.hue;
  const hueFinal = hueRaw != null && Number.isFinite(Number(hueRaw)) ? Number(hueRaw) : hue(id);

  const priceRaw = raw.price;
  const price =
    priceRaw == null || priceRaw === '' || !Number.isFinite(Number(priceRaw))
      ? null
      : Number(priceRaw);

  const available =
    raw.available != null
      ? Boolean(raw.available)
      : raw.availability != null
        ? Boolean(raw.availability)
        : true;

  const game: FeedGame = {
    id,
    slug: str(raw.slug) || id,
    name,
    category,
    genres,
    platforms: platformsFinal,
    sizeGb,
    year: Number(raw.year ?? raw.releaseYear) || null,
    price,
    available,
    cover,
    banner,
    screenshots,
    description: str(raw.description) || null,
    requirements: (
      typeof raw.requirements === 'object' && raw.requirements !== null
        ? raw.requirements
        : typeof raw.systemRequirements === 'object' && raw.systemRequirements !== null
          ? raw.systemRequirements
          : { minimum: null, recommended: null }
    ) as FeedGame['requirements'],
    minRequirements: formatRequirements(minRequirementsRaw),
    recommendedRequirements: formatRequirements(recommendedRequirementsRaw),
    addedAt,
    soon: Boolean(raw.soon ?? raw.comingSoon),
    releaseDate,
    hue: hueFinal,
    searchIndex: '',
  };

  game.searchIndex = norm(
    [game.name, game.category ?? '', ...game.genres, ...game.platforms].join(' '),
  );

  return game;
};

export const toFeedGame = (game: PublicGame): FeedGame | null =>
  normalizeGame(game as unknown as LooseGame);

export const toFeedGames = (games: PublicGame[]): FeedGame[] =>
  games.map(toFeedGame).filter((g): g is FeedGame => g !== null);

export const normalizeCatalog = (payload: {
  games?: unknown;
  version?: unknown;
  catalogVersion?: unknown;
  updatedAt?: unknown;
}): FeedCatalog => {
  const gamesRaw = payload.games ?? (payload as { data?: { games?: unknown } }).data?.games;
  const version = Number(payload.version ?? payload.catalogVersion);
  if (!Array.isArray(gamesRaw) || !Number.isFinite(version)) {
    throw new Error('Formato de catálogo inválido');
  }
  const games = (gamesRaw as LooseGame[]).map(normalizeGame).filter((g): g is FeedGame => g !== null);
  return {
    catalogVersion: version,
    updatedAt: str(payload.updatedAt) || null,
    games,
  };
};
