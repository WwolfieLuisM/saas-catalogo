import { nf, rel } from './format.ts';

export { nf };

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
  tenantCount?: number;
  administratorCount?: number;
  baseGameCount?: number;
  mediaCount?: number;
  catalogPending?: number;
  catalogUpdatedAt?: string | null;
  lastBackupAt?: string | null;
  availablePriceSum?: number;
  gamesWithoutCover?: number;
  priceChanges?: number;
  gamesWithoutSize?: number;
}

export type DashboardRole = 'SUPER_ADMIN' | 'ADMIN';

export interface StatRow {
  value: string;
  label: string;
  cls?: string;
  dot?: 'ok' | 'wn' | 'bd';
}

export function statsOf(d: DashboardData, role: DashboardRole): StatRow[] {
  if (role === 'SUPER_ADMIN') {
    const media = d.mediaCount === undefined ? '—' : nf(d.mediaCount);
    return [
      { value: d.tenantCount === undefined ? '—' : nf(d.tenantCount), label: 'Negocios' },
      {
        value: nf(d.baseGameCount ?? d.libraryGames),
        label: 'Juegos en biblioteca base',
      },
      { value: nf(d.availableGames), label: 'Juegos publicados' },
      {
        value: d.administratorCount === undefined ? '—' : nf(d.administratorCount),
        label: 'Administradores',
      },
      { value: media, label: 'Archivos multimedia' },
      { value: 'Operativo', label: 'Estado del sistema', cls: 't', dot: 'ok' },
      {
        value: d.lastBackupAt ? rel(d.lastBackupAt) : '—',
        label: 'Último backup',
        cls: 't',
      },
    ];
  }

  const pending = d.catalogPending ?? 0;
  const media = d.mediaCount === undefined ? '—' : nf(d.mediaCount);
  return [
    { value: nf(d.totalGames), label: 'Juegos en tu catálogo' },
    { value: nf(d.availableGames), label: 'Disponibles' },
    { value: nf(d.unavailableGames), label: 'No disponibles' },
    {
      value: d.availablePriceSum === undefined ? '—' : nf(d.availablePriceSum),
      label: 'CUP sumando disponibles',
    },
    { value: media, label: 'Archivos multimedia' },
    {
      value: d.catalogUpdatedAt ? rel(d.catalogUpdatedAt) : '—',
      label: 'Última actualización',
      cls: 't',
    },
    {
      value: pending ? `${nf(pending)} sin publicar` : 'Al día',
      label: `Sincronización · v${d.catalogVersion ?? 0}`,
      cls: 't',
      dot: pending ? 'wn' : 'ok',
    },
  ];
}

export interface AttentionRow {
  text: string;
  href: string;
  action: string;
}

export function attentionOf(d: DashboardData): AttentionRow[] {
  const rows: AttentionRow[] = [];
  if (d.gamesWithoutSize) {
    // El tamaño es la entrada de las reglas de precio: sin él no hay precio.
    rows.push({
      text: `${nf(d.gamesWithoutSize)} juego(s) sin tamaño en la biblioteca`,
      href: '/admin/biblioteca',
      action: 'Completar',
    });
  }
  if (d.catalogPending) {
    rows.push({
      text: `${nf(d.catalogPending)} cambio(s) sin publicar en el catálogo`,
      href: '/admin/configuracion/catalogo',
      action: 'Publicar',
    });
  }
  if (d.priceChanges) {
    rows.push({
      text: `${nf(d.priceChanges)} juego(s) cambiarían de precio con las reglas guardadas`,
      href: '/admin/configuracion/precios',
      action: 'Revisar',
    });
  }
  if (d.gamesWithoutCover) {
    rows.push({
      text: `${nf(d.gamesWithoutCover)} juego(s) sin portada`,
      href: '/admin/juegos',
      action: 'Ver juegos',
    });
  }
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
  return rows.slice(0, 5);
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
