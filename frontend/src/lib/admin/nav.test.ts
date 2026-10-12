import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BNAV,
  NAV,
  navActive,
  navGroupsFor,
  navHref,
  navItemVisible,
  navVisible,
  titleFor,
} from './nav.ts';

test('NAV replica las 4 secciones de adminv2', () => {
  assert.equal(NAV.length, 4);
  assert.deepEqual(
    NAV.map((group) => group.group),
    ['Principal', 'Administración', 'Plataforma', 'Configuración'],
  );
  assert.equal(NAV[0].items.length, 7);
  assert.equal(NAV[1].items.length, 3);
  assert.equal(NAV[3].items.length, 7);
});

test('Plataforma solo es visible para SUPER_ADMIN', () => {
  assert.equal(NAV[2].role, 'SUPER_ADMIN');
  const sa = NAV.filter((group) => navVisible(group, 'SUPER_ADMIN'));
  const admin = NAV.filter((group) => navVisible(group, 'ADMIN'));
  assert.equal(sa.length, 4);
  assert.equal(admin.length, 3);
  assert.ok(!admin.some((group) => group.group === 'Plataforma'));
});

test('navItemVisible aplica rol por item', () => {
  const adminItem = { key: 'administradores', label: 'Administradores', role: 'SUPER_ADMIN' as const };
  const plainItem = { key: 'auditoria', label: 'Auditoría' };
  assert.equal(navItemVisible(adminItem, 'SUPER_ADMIN'), true);
  assert.equal(navItemVisible(adminItem, 'ADMIN'), false);
  assert.equal(navItemVisible(plainItem, 'ADMIN'), true);
  assert.equal(navItemVisible(plainItem, 'SUPER_ADMIN'), true);
});

test('navGroupsFor filtra grupos y items por rol', () => {
  const saGroups = navGroupsFor('SUPER_ADMIN');
  const adminGroups = navGroupsFor('ADMIN');

  assert.equal(saGroups.length, 4);
  assert.equal(adminGroups.length, 3);

  const adminGroupNames = adminGroups.map((g) => g.group);
  assert.ok(!adminGroupNames.includes('Plataforma'));

  const saAdmins = saGroups.find((g) => g.group === 'Administración');
  const adminAdmins = adminGroups.find((g) => g.group === 'Administración');
  assert.equal(saAdmins?.items.length, 3);
  assert.equal(adminAdmins?.items.length, 2);
  assert.ok(!adminAdmins?.items.some((i) => i.key === 'administradores'));
  assert.ok(adminAdmins?.items.some((i) => i.key === 'auditoria'));
});

test('navHref apunta dashboard a /admin y el resto a /admin/<key>', () => {
  assert.equal(navHref('dashboard'), '/admin');
  assert.equal(navHref('categorias'), '/admin/categorias');
  assert.equal(navHref('configuracion/general'), '/admin/configuracion/general');
});

test('navActive resalta juegos con prefijo y tabs exactos', () => {
  assert.ok(navActive('/admin', 'dashboard'));
  assert.ok(navActive('/admin/juegos', 'juegos'));
  assert.ok(navActive('/admin/juegos/nuevo', 'juegos'));
  assert.ok(navActive('/admin/juegos/abc-123/editar', 'juegos'));
  assert.ok(!navActive('/admin/biblioteca', 'juegos'));
  assert.ok(navActive('/admin/configuracion/precios', 'configuracion/precios'));
  assert.ok(!navActive('/admin/configuracion/precios', 'configuracion/general'));
  assert.ok(!navActive('/admin/configuracion', 'configuracion/general'));
});

test('titleFor cubre rutas del panel con fallback', () => {
  assert.equal(titleFor('/admin'), 'Dashboard');
  assert.equal(titleFor('/admin/dashboard'), 'Dashboard');
  assert.equal(titleFor('/admin/categorias'), 'Categorías');
  assert.equal(titleFor('/admin/juegos'), 'Juegos');
  assert.equal(titleFor('/admin/juegos/nuevo'), 'Nuevo juego');
  assert.equal(titleFor('/admin/juegos/9f1d'), 'Juego');
  assert.equal(titleFor('/admin/juegos/9f1d/editar'), 'Editar juego');
  assert.equal(titleFor('/admin/configuracion/datos'), 'Datos / Importación');
  assert.equal(titleFor('/admin/desconocida'), 'Admin');
});

test('BNAV son 4 accesos rápidos', () => {
  assert.equal(BNAV.length, 4);
  assert.deepEqual(
    BNAV.map((item) => item.key),
    ['dashboard', 'juegos', 'biblioteca', 'media'],
  );
  assert.deepEqual(
    BNAV.map((item) => item.label),
    ['Inicio', 'Juegos', 'Biblioteca', 'Multimedia'],
  );
});
