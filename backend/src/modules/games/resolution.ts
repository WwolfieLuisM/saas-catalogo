export type InheritableField =
  | 'title'
  | 'description'
  | 'sizeValue'
  | 'sizeUnit'
  | 'releaseYear'
  | 'categoryId'
  | 'minimumRequirements'
  | 'recommendedRequirements';

export interface ResolutionTenantGame {
  clearedFields?: unknown;
  title?: string | null;
  description?: string | null;
  sizeValue?: number | null;
  sizeUnit?: string | null;
  releaseYear?: number | null;
  categoryId?: string | null;
  minimumRequirements?: unknown;
  recommendedRequirements?: unknown;
}

export interface ResolutionVariant {
  sizeValue?: number | null;
  sizeUnit?: string | null;
  minimumRequirements?: unknown;
  recommendedRequirements?: unknown;
}

export interface ResolutionBaseGame {
  title?: string | null;
  description?: string | null;
  sizeValue?: number | null;
  sizeUnit?: string | null;
  releaseYear?: number | null;
  categoryId?: string | null;
  minimumRequirements?: unknown;
  recommendedRequirements?: unknown;
}

interface FinalValueMap {
  title: string | null;
  description: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
  releaseYear: number | null;
  categoryId: string | null;
  minimumRequirements: unknown;
  recommendedRequirements: unknown;
}

export type MediaKindFilter = 'COVER' | 'SHOT';

export interface ResolutionMedia {
  id?: string;
  kind: string;
  url?: string | null;
  status?: string;
  sortOrder?: number;
}

function clearedSet(clearedFields: unknown): Set<string> {
  if (!Array.isArray(clearedFields)) {
    return new Set();
  }
  return new Set(
    clearedFields.filter((field): field is string => typeof field === 'string'),
  );
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined;
}

export function resolveFinal<K extends InheritableField>(
  tenantGame: ResolutionTenantGame | null | undefined,
  variant: ResolutionVariant | null | undefined,
  baseGame: ResolutionBaseGame | null | undefined,
  field: K,
): FinalValueMap[K] {
  if (clearedSet(tenantGame?.clearedFields).has(field)) {
    return null as FinalValueMap[K];
  }

  const tenantValue = tenantGame?.[field];
  if (present(tenantValue)) {
    return tenantValue as FinalValueMap[K];
  }

  const variantValue = variant ? (variant as Record<string, unknown>)[field] : undefined;
  if (present(variantValue)) {
    return variantValue as FinalValueMap[K];
  }

  const baseValue = baseGame ? (baseGame as Record<string, unknown>)[field] : undefined;
  return (present(baseValue) ? baseValue : null) as FinalValueMap[K];
}

function firstValidCover(list: ResolutionMedia[]): ResolutionMedia | null {
  const valid = list
    .filter(
      (item) =>
        item.kind === 'COVER' && typeof item.url === 'string' && item.url.length > 0 &&
        (item.status ?? 'OK') === 'OK',
    )
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  return valid[0] ?? null;
}

export function resolveCover(
  tenantMedia: ResolutionMedia[],
  libraryMedia: ResolutionMedia[],
  clearedFields?: unknown,
): ResolutionMedia | null {
  if (clearedSet(clearedFields).has('cover')) {
    return null;
  }
  return firstValidCover(tenantMedia) ?? firstValidCover(libraryMedia);
}

export function resolveGenres(
  tenantGenreIds: string[],
  baseGenreIds: string[],
  clearedFields?: unknown,
): string[] {
  if (clearedSet(clearedFields).has('genres')) {
    return [];
  }
  if (tenantGenreIds.length > 0) {
    return [...tenantGenreIds];
  }
  return [...baseGenreIds];
}

export function resolvePlatformIds(platformId: string, bridgeIds: string[]): string[] {
  return [...new Set([platformId, ...bridgeIds])].sort();
}
