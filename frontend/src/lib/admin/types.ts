export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  data: T[];
  meta: PageMeta;
}

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN';

export interface TaxonomyItem {
  id: string;
  tenantId: string | null;
  name: string;
  slug: string;
  description: string | null;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxonomySummary {
  id: string;
  name: string;
  slug: string;
}

export interface GameRequirements {
  cpu: string;
  gpu: string;
  ram: string;
  os: string;
  directX: string;
  storage: string;
}

export interface ResolvedGameSummary {
  title: string | null;
  description: string | null;
  sizeValue: number | null;
  sizeUnit: string | null;
  releaseYear: number | null;
  categoryId: string | null;
  minimumRequirements: GameRequirements | null;
  recommendedRequirements: GameRequirements | null;
  genres: TaxonomySummary[];
  platforms: TaxonomySummary[];
  category: TaxonomySummary | null;
}

export interface GameItem {
  id: string;
  tenantId: string;
  baseGameId: string | null;
  baseGame: { id: string; slug: string; title: string } | null;
  origin: 'BIBLIOTECA' | 'PERSONALIZADO';
  title: string;
  slug: string;
  description: string | null;
  priceMode: string;
  price: number | null;
  availability: boolean;
  sizeValue: number | null;
  sizeUnit: string | null;
  releaseYear: number | null;
  categoryId: string | null;
  category: TaxonomySummary | null;
  genres: TaxonomySummary[];
  platforms: TaxonomySummary[];
  minimumRequirements: GameRequirements | null;
  recommendedRequirements: GameRequirements | null;
  platformId: string;
  platform: TaxonomySummary | null;
  clearedFields: string[];
  resolved: ResolvedGameSummary;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type BaseGameStatus = 'ACTIVE' | 'PENDING_ENRICHMENT' | 'INCOMPLETE';

export interface BaseGameEntry {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  sizeValue: number;
  sizeUnit: 'MB' | 'GB' | 'TB';
  releaseYear: number | null;
  status: BaseGameStatus;
  source: string | null;
  keywords: string | null;
  developer: string | null;
  publisher: string | null;
  categoryId: string | null;
  category: TaxonomySummary | null;
  genres: TaxonomySummary[];
  platforms: TaxonomySummary[];
  minimumRequirements: GameRequirements | null;
  recommendedRequirements: GameRequirements | null;
  deletedAt: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  deletedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryMediaEntry {
  id: string;
  baseGameId: string;
  kind: MediaKind;
  url: string | null;
  publicId: string | null;
  sortOrder: number;
  status: MediaStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryMediaManifest {
  cover: LibraryMediaEntry | null;
  screenshots: LibraryMediaEntry[];
}

export type MediaKind = 'COVER' | 'SHOT';
export type MediaStatus = 'OK' | 'PENDING' | 'ERROR' | 'ORPHAN';

export interface MediaEntry {
  id: string;
  tenantId: string;
  gameId: string;
  kind: MediaKind;
  url: string | null;
  publicId: string | null;
  sortOrder: number;
  status: MediaStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  game: { id: string; title: string; slug: string } | null;
}

export interface MediaManifest {
  gameId: string;
  slug: string;
  title: string;
  prefix: string;
  cover: Omit<MediaEntry, 'game'> | null;
  screenshots: Array<Omit<MediaEntry, 'game'>>;
  counts: { total: number; ok: number; error: number; orphan: number; pending: number };
  synced: boolean;
}

export interface PricingRule {
  id: string;
  tenantId: string | null;
  minSize: number;
  maxSize: number | null;
  price: number;
  active: boolean;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string | null;
  actorUsername: string | null;
  actorRole: string | null;
  tenantId: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
}

export interface SessionEntry {
  id: string;
  adminId: string;
  adminUsername: string | null;
  adminRole: string | null;
  tenantId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  isCurrent: boolean;
}

export interface AdminEntry {
  id: string;
  username: string;
  role: AdminRole;
  tenantId: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenantEntry {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TenantPlatform {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
}

export interface TenantConfig {
  tenantId: string;
  publicName: string | null;
  whatsapp: string;
  footer: string;
  phone: string;
  email: string;
  logo: string;
  socialLinks: { label: string; url: string }[];
  showUnavailable: boolean;
  offerOffline: boolean;
  updatedAt: string | null;
}

export interface SystemInfo {
  status: 'ok' | 'degraded';
  database: string;
  uptimeSeconds: number;
  nodeVersion: string;
  environment: string;
  timestamp: string;
}

export interface BackupEntry {
  id: string;
  tenantId: string | null;
  type: string;
  scope: 'PLATAFORMA' | 'TENANT';
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingRuleInput {
  minSize: number;
  maxSize: number | null;
  price: number;
  active: boolean;
}

export interface PricingPreview {
  rulesActive: number;
  changes: Array<{
    id: string;
    title: string;
    slug: string;
    sizeGb: number;
    priceFrom: number | null;
    priceTo: number;
  }>;
  changeCount: number;
  unchangedCount: number;
  uncovered: Array<{
    id: string;
    title: string;
    slug: string;
    sizeGb: number;
  }>;
  uncoveredCount: number;
  manualCount: number;
  totalGames: number;
}

export interface ImportValidateResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ImportPreviewResult {
  warnings: string[];
  fingerprint: string;
  changes: {
    create: Array<{ index: number; title: string; slug: string; availability: boolean }>;
    update: Array<{
      index: number;
      id: string;
      title: string;
      slug: string;
      fields: string[];
    }>;
    delete: Array<{ id: string; title: string; slug: string }>;
    unchanged: number;
  };
}

export interface ImportRunResult {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
  version: number;
}

export interface CatalogVersionInfo {
  version: number;
  updatedAt: string | null;
}
