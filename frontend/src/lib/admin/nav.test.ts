import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BNAV,
  NAV,
  navActive,
  navHref,
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
