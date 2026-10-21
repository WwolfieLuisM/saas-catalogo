import { z } from 'zod';
import { getPrisma } from '../../config/database.js';
import type { Prisma } from '../../generated/client.js';
import { AppError } from '../../utils/appError.js';

export type JsonFieldValue = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;

export function jsonValue(value: unknown): JsonFieldValue {
  return value as JsonFieldValue;
}

/**
 * El tamaño se guarda en la base como 0 cuando no se conoce, porque la columna
 * no admite null; y0 nunca es un tamaño válido (sizeValueSchema solo admite
 * positivos). Este traductor devuelve null en ese caso para que la UI pinte
 * «—» y no «0 GB», y arrastra la unidad para que no quede «— GB».
 */
export function presentSize<T>(
  sizeValue: number | null | undefined,
  sizeUnit: T | null | undefined,
): { sizeValue: number | null; sizeUnit: T | null } {
  if (sizeValue === null || sizeValue === undefined || sizeValue <= 0) {
    return { sizeValue: null, sizeUnit: null };
  }

  return { sizeValue, sizeUnit: sizeUnit ?? null };
}

export const slugSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido');

export const sizeValueSchema = z.number().positive().max(100000);

export const sizeUnitSchema = z.enum(['MB', 'GB', 'TB']);

export const priceModeSchema = z.enum(['RULE', 'MANUAL']);

export const requirementsSchema = z.object({
  cpu: z.string().trim().max(150).optional(),
  gpu: z.string().trim().max(150).optional(),
  ram: z.string().trim().max(50).optional(),
  os: z.string().trim().max(100).optional(),
  directX: z.string().trim().max(50).optional(),
  storage: z.string().trim().max(100).optional(),
});

export const taxonomyIdsSchema = z.array(z.string().uuid()).max(50);

export type RequirementsInput = z.infer<typeof requirementsSchema>;

export function resolveRequirements(minimum?: RequirementsInput, recommended?: RequirementsInput) {
  const minimumRequirements = minimum ?? null;
  let recommendedRequirements = recommended ?? null;

  if (!recommendedRequirements && minimumRequirements) {
    recommendedRequirements = JSON.parse(JSON.stringify(minimumRequirements)) as RequirementsInput;
  }

  return { minimumRequirements, recommendedRequirements };
}

export interface TaxonomyRefsInput {
  categoryId?: string | null;
  genreIds?: string[];
  platformIds?: string[];
}

export async function assertTaxonomyRefs(refs: TaxonomyRefsInput): Promise<void> {
  const prisma = getPrisma();

  if (refs.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: refs.categoryId, tenantId: null, deletedAt: null },
    });
    if (!category) {
      throw new AppError(422, 'CATEGORY_NOT_FOUND', 'La categoría indicada no existe');
    }
  }

  if (refs.genreIds?.length) {
    const genres = await prisma.genre.findMany({
      where: { id: { in: refs.genreIds }, tenantId: null, deletedAt: null },
      select: { id: true },
    });
    if (genres.length !== refs.genreIds.length) {
      throw new AppError(422, 'GENRE_NOT_FOUND', 'Uno o más géneros indicados no existen', {
        missingIds: refs.genreIds.filter((id) => !genres.some((genre) => genre.id === id)),
      });
    }
  }

  if (refs.platformIds?.length) {
    const platforms = await prisma.platform.findMany({
      where: { id: { in: refs.platformIds }, tenantId: null, deletedAt: null },
      select: { id: true },
    });
    if (platforms.length !== refs.platformIds.length) {
      throw new AppError(422, 'PLATFORM_NOT_FOUND', 'Una o más plataformas indicadas no existen', {
        missingIds: refs.platformIds.filter(
          (id) => !platforms.some((platform) => platform.id === id),
        ),
      });
    }
  }
}
