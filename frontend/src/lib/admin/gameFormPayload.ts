export interface GameFormPlatform {
  id: string;
  slug: string;
}

export interface GameFormCommercial {
  priceMode: 'RULE' | 'MANUAL';
  price: number | null;
  availability: boolean;
  categoryId: string | null;
}

export interface GameFormContent {
  title: string;
  slug: string;
  description: string | null;
  sizeValue: number;
  sizeUnit: 'MB' | 'GB' | 'TB';
  releaseYear: number | null;
  genreId: string;
  platformId: string;
  minimumRequirements: unknown;
  recommendedRequirements: unknown;
}

export function defaultPlatformId(platforms: GameFormPlatform[], current: string): string {
  if (current) return current;
  const pc = platforms.find((platform) => platform.slug === 'pc');
  return pc?.id ?? platforms[0]?.id ?? '';
}

export function gameFormErrors(
  content: GameFormContent,
  commercial: GameFormCommercial,
): string[] {
  const errors: string[] = [];
  const title = content.title.trim();

  if (title.length < 2 || title.length > 150) errors.push('Escribe el título.');
  if (!content.genreId) errors.push('Elige un género.');
  if (!(content.sizeValue > 0)) errors.push('El tamaño debe ser mayor que 0.');
  if (!content.platformId) errors.push('Elige la plataforma de la oferta.');
  if (commercial.priceMode === 'MANUAL' && !(commercial.price !== null && commercial.price >= 0)) {
    errors.push('Escribe el precio manual.');
  }

  return errors;
}

export function buildCreateGameBody(
  content: GameFormContent,
  commercial: GameFormCommercial,
  tenantId?: string,
): Record<string, unknown> {
  const slug = content.slug.trim();
  const body: Record<string, unknown> = {
    ...(tenantId ? { tenantId } : {}),
    platformId: content.platformId,
    title: content.title.trim(),
    ...(slug.length >= 3 && slug.length <= 50 ? { slug } : {}),
    description: content.description,
    sizeValue: content.sizeValue,
    sizeUnit: content.sizeUnit,
    ...(content.releaseYear !== null ? { releaseYear: content.releaseYear } : {}),
    genreIds: [content.genreId],
    priceMode: commercial.priceMode,
    ...(commercial.priceMode === 'MANUAL' ? { price: commercial.price } : {}),
    availability: commercial.availability,
    categoryId: commercial.categoryId,
    minimumRequirements: content.minimumRequirements,
    recommendedRequirements: content.recommendedRequirements,
  };

  return body;
}

export function buildPatchGameBody(
  content: GameFormContent,
  commercial: GameFormCommercial,
): Record<string, unknown> {
  return {
    title: content.title.trim(),
    description: content.description,
    sizeValue: content.sizeValue,
    sizeUnit: content.sizeUnit,
    ...(content.releaseYear !== null ? { releaseYear: content.releaseYear } : {}),
    genreIds: [content.genreId],
    priceMode: commercial.priceMode,
    ...(commercial.priceMode === 'MANUAL' ? { price: commercial.price } : {}),
    availability: commercial.availability,
    categoryId: commercial.categoryId,
    minimumRequirements: content.minimumRequirements,
    recommendedRequirements: content.recommendedRequirements,
  };
}