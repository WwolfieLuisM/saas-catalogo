export interface TaxonomyConfig {
  entity: 'Category' | 'Genre' | 'Platform';
  delegate: 'category' | 'genre' | 'platform';
  notFoundCode: string;
  slugExistsCode: string;
}

export const categoryTaxonomy: TaxonomyConfig = {
  entity: 'Category',
  delegate: 'category',
  notFoundCode: 'CATEGORY_NOT_FOUND',
  slugExistsCode: 'CATEGORY_SLUG_EXISTS',
};

export const genreTaxonomy: TaxonomyConfig = {
  entity: 'Genre',
  delegate: 'genre',
  notFoundCode: 'GENRE_NOT_FOUND',
  slugExistsCode: 'GENRE_SLUG_EXISTS',
};

export const platformTaxonomy: TaxonomyConfig = {
  entity: 'Platform',
  delegate: 'platform',
  notFoundCode: 'PLATFORM_NOT_FOUND',
  slugExistsCode: 'PLATFORM_SLUG_EXISTS',
};
