import type { AdminIconName } from '../../components/admin/icons.tsx';
import type { AdminRole } from './types.ts';

export interface NavItem {
  key: string;
  label: string;
  icon?: AdminIconName;
  role?: AdminRole;
}

export interface NavGroup {
  group: string;
  role?: AdminRole;
  items: NavItem[];
}

export const NAV: readonly NavGroup[] = [
  {
    group: 'Principal',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: 'dash' },
      { key: 'juegos', label: 'Juegos', icon: 'games' },
      { key: 'biblioteca', label: 'Biblioteca base', icon: 'library' },
      { key: 'categorias', label: 'Categorías', icon: 'tag' },
      { key: 'generos', label: 'Géneros', icon: 'layers' },
      { key: 'plataformas', label: 'Plataformas', icon: 'monitor' },
      { key: 'media', label: 'Multimedia', icon: 'image' },
    ],
  },
  {
    group: 'Administración',
    items: [
      { key: 'administradores', label: 'Administradores', icon: 'users', role: 'SUPER_ADMIN' },
      { key: 'auditoria', label: 'Auditoría', icon: 'audit' },
      { key: 'sesiones', label: 'Sesiones', icon: 'key' },
    ],
  },
  {
    group: 'Plataforma',
    role: 'SUPER_ADMIN',
    items: [{ key: 'negocios', label: 'Negocios', icon: 'building' }],
  },
  {
    group: 'Configuración',
    items: [
      { key: 'configuracion/general', label: 'General', icon: 'cfg' },
      { key: 'configuracion/catalogo', label: 'Catálogo' },
      { key: 'configuracion/precios', label: 'Precios' },
      { key: 'configuracion/datos', label: 'Datos / Importación' },
      { key: 'configuracion/backups', label: 'Backups' },
      { key: 'configuracion/multimedia', label: 'Multimedia' },
      { key: 'configuracion/sistema', label: 'Sistema' },
    ],
  },
];

export const BNAV: readonly NavItem[] = [
  { key: 'dashboard', label: 'Inicio', icon: 'dash' },
  { key: 'juegos', label: 'Juegos', icon: 'games' },
  { key: 'biblioteca', label: 'Biblioteca', icon: 'library' },
  { key: 'media', label: 'Multimedia', icon: 'image' },
];

export function navHref(key: string): string {
  return key === 'dashboard' ? '/admin' : `/admin/${key}`;
}

export function navActive(pathname: string, key: string): boolean {
  const href = navHref(key);
  if (key === 'juegos') return pathname === href || pathname.startsWith(`${href}/`);
  return pathname === href;
}

export function navVisible(group: NavGroup, role: AdminRole): boolean {
  return !group.role || group.role === role;
}

export function navItemVisible(item: NavItem, role: AdminRole): boolean {
  return !item.role || item.role === role;
}

export function navGroupsFor(role: AdminRole): NavGroup[] {
  return NAV.filter((group) => navVisible(group, role)).map((group) => ({
    ...group,
    items: group.items.filter((item) => navItemVisible(item, role)),
  }));
}

const TITLES: readonly (readonly [string, string])[] = [
  ['/admin/configuracion/general', 'General'],
  ['/admin/configuracion/catalogo', 'Catálogo'],
  ['/admin/configuracion/precios', 'Precios'],
  ['/admin/configuracion/datos', 'Datos / Importación'],
  ['/admin/configuracion/backups', 'Backups'],
  ['/admin/configuracion/multimedia', 'Multimedia'],
  ['/admin/configuracion/sistema', 'Sistema'],
  ['/admin/configuracion', 'Configuración'],
  ['/admin/juegos/nuevo', 'Nuevo juego'],
  ['/admin/juegos', 'Juegos'],
  ['/admin/biblioteca', 'Biblioteca base'],
  ['/admin/categorias', 'Categorías'],
  ['/admin/generos', 'Géneros'],
  ['/admin/plataformas', 'Plataformas'],
  ['/admin/media', 'Multimedia'],
  ['/admin/administradores', 'Administradores'],
  ['/admin/auditoria', 'Auditoría'],
  ['/admin/sesiones', 'Sesiones'],
  ['/admin/negocios', 'Negocios'],
  ['/admin/dashboard', 'Dashboard'],
  ['/admin', 'Dashboard'],
];

export function titleFor(pathname: string): string {
  for (const [prefix, title] of TITLES) {
    if (pathname === prefix) return title;
  }
  if (/^\/admin\/juegos\/[^/]+\/editar$/.test(pathname)) return 'Editar juego';
  if (/^\/admin\/juegos\/[^/]+$/.test(pathname)) return 'Juego';
  return 'Admin';
}
