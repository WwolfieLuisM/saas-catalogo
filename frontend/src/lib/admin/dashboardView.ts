export interface DashboardData {
  totalGames: number;
  availableGames: number;
  unavailableGames: number;
  libraryGames: number;
  customGames: number;
  mediaErrors: number;
  orphanMedia: number;
  activeSessions: number;
  recentAuditEvents: number;
  catalogVersion: number | null;
}

export function nf(n: number): string {
  return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function statsOf(d: DashboardData): Array<[string, string]> {
  return [
    [nf(d.totalGames), 'Juegos en el catálogo'],
    [nf(d.availableGames), 'Disponibles'],
    [nf(d.unavailableGames), 'No disponibles'],
    [nf(d.libraryGames), 'Juegos en biblioteca base'],
    [nf(d.customGames), 'Juegos personalizados'],
    [nf(d.activeSessions), 'Sesiones activas'],
    [nf(d.recentAuditEvents), 'Eventos de auditoría (24 h)'],
    [d.catalogVersion === null ? '—' : nf(d.catalogVersion), 'Versión del catálogo'],
  ];
}

export interface AttentionRow {
  text: string;
  href: string;
  action: string;
}

export function attentionOf(d: DashboardData): AttentionRow[] {
  const rows: AttentionRow[] = [];
  if (d.orphanMedia) {
    rows.push({
      text: `${nf(d.orphanMedia)} archivo(s) huérfano(s) en Cloudinary`,
      href: '/admin/media',
      action: 'Revisar',
    });
  }
  if (d.mediaErrors) {
    rows.push({
      text: `${nf(d.mediaErrors)} subida(s) fallida(s)`,
      href: '/admin/media',
      action: 'Reintentar',
    });
  }
  return rows;
}

export interface InfraRow {
  name: string;
  detail: string;
}

export const INFRA_ROWS: readonly InfraRow[] = [
  {
    name: 'Neon / PostgreSQL',
    detail: 'Datos, catálogo, configuración y referencias multimedia',
  },
  { name: 'Prisma', detail: 'Esquema y migraciones al día' },
  {
    name: 'Cloudinary',
    detail: 'Imágenes y miniaturas (la base solo guarda referencias)',
  },
  {
    name: 'API /api/v1',
    detail: 'Autenticación, autorización y tenantId por sesión',
  },
];
