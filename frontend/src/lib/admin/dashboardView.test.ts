import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  INFRA_ROWS,
  attentionOf,
  nf,
  statsOf,
  type DashboardData,
} from './dashboardView.ts';

const sample: DashboardData = {
  totalGames: 12,
  availableGames: 9,
  unavailableGames: 3,
  libraryGames: 4,
  customGames: 8,
  mediaErrors: 2,
  orphanMedia: 1,
  activeSessions: 3,
  recentAuditEvents: 17,
  catalogVersion: 41,
  tenantCount: 2,
  administratorCount: 5,
  baseGameCount: 100,
  mediaCount: 30,
  catalogPending: 3,
  catalogUpdatedAt: '2026-01-01T00:00:00Z',
  lastBackupAt: '2026-01-01T00:00:00Z',
  availablePriceSum: 4500,
  gamesWithoutCover: 4,
  priceChanges: 2,
  gamesWithoutSize: 11,
};

test('statsOf devuelve 7 filas para SUPER_ADMIN', () => {
  const stats = statsOf(sample, 'SUPER_ADMIN');
  assert.equal(stats.length, 7);
  assert.equal(stats[0].label, 'Negocios');
  assert.equal(stats[0].value, '2');
  assert.equal(stats[1].label, 'Juegos en biblioteca base');
  assert.equal(stats[1].value, '100');
  assert.equal(stats[2].label, 'Juegos publicados');
  assert.equal(stats[2].value, '9');
  assert.equal(stats[3].label, 'Administradores');
  assert.equal(stats[3].value, '5');
  assert.equal(stats[4].label, 'Archivos multimedia');
  assert.equal(stats[4].value, '30');
  assert.equal(stats[5].label, 'Estado del sistema');
  assert.equal(stats[5].value, 'Operativo');
  assert.equal(stats[5].dot, 'ok');
  assert.equal(stats[6].label, 'Último backup');
  assert.equal(stats[6].cls, 't');
});

test('statsOf devuelve 7 filas para ADMIN', () => {
  const stats = statsOf(sample, 'ADMIN');
  assert.equal(stats.length, 7);
  assert.equal(stats[0].label, 'Juegos en tu catálogo');
  assert.equal(stats[0].value, '12');
  assert.equal(stats[1].label, 'Disponibles');
  assert.equal(stats[1].value, '9');
  assert.equal(stats[2].label, 'No disponibles');
  assert.equal(stats[2].value, '3');
  assert.equal(stats[3].label, 'CUP sumando disponibles');
  assert.equal(stats[3].value, '4,500');
  assert.equal(stats[4].label, 'Archivos multimedia');
  assert.equal(stats[4].value, '30');
  assert.equal(stats[5].label, 'Última actualización');
  assert.equal(stats[5].cls, 't');
  assert.equal(stats[6].label, 'Sincronización · v41');
  assert.equal(stats[6].dot, 'wn');
  assert.equal(stats[6].value, '3 sin publicar');
});

test('statsOf muestra — cuando faltan campos opcionales', () => {
  const base: DashboardData = {
    totalGames: 1,
    availableGames: 1,
    unavailableGames: 0,
    libraryGames: 0,
    customGames: 1,
    mediaErrors: 0,
    orphanMedia: 0,
    activeSessions: 1,
    recentAuditEvents: 0,
    catalogVersion: null,
  };
  const sa = statsOf(base, 'SUPER_ADMIN');
  assert.equal(sa[0].value, '—');
  assert.equal(sa[3].value, '—');
  assert.equal(sa[4].value, '—');
  assert.equal(sa[6].value, '—');
  const admin = statsOf(base, 'ADMIN');
  assert.equal(admin[3].value, '—');
  assert.equal(admin[4].value, '—');
  assert.equal(admin[5].value, '—');
  assert.equal(admin[6].label, 'Sincronización · v0');
  assert.equal(admin[6].value, 'Al día');
  assert.equal(admin[6].dot, 'ok');
});

test('nf agrupa millares con coma', () => {
  assert.equal(nf(1234), '1,234');
  assert.equal(nf(0), '0');
  assert.equal(nf(41.5), '41.5');
});

test('attentionOf queda vacío sin incidencias', () => {
  const rows = attentionOf({
    ...sample,
    catalogPending: 0,
    priceChanges: 0,
    gamesWithoutCover: 0,
    gamesWithoutSize: 0,
    mediaErrors: 0,
    orphanMedia: 0,
  });
  assert.deepEqual(rows, []);
});

test('attentionOf lista hasta 5 filas en orden con enlace y acción', () => {
  const rows = attentionOf(sample);
  assert.equal(rows.length, 5);
  assert.match(rows[0].text, /11 juego\(s\) sin tamaño en la biblioteca/);
  assert.equal(rows[0].href, '/admin/biblioteca');
  assert.equal(rows[0].action, 'Completar');
  assert.match(rows[1].text, /3 cambio\(s\) sin publicar/);
  assert.equal(rows[1].href, '/admin/configuracion/catalogo');
  assert.equal(rows[1].action, 'Publicar');
  assert.match(rows[2].text, /2 juego\(s\) cambiarían de precio/);
  assert.equal(rows[2].href, '/admin/configuracion/precios');
  assert.equal(rows[2].action, 'Revisar');
  assert.match(rows[3].text, /4 juego\(s\) sin portada/);
  assert.equal(rows[3].href, '/admin/juegos');
  assert.equal(rows[3].action, 'Ver juegos');
  assert.match(rows[4].text, /1 archivo\(s\) huérfano\(s\)/);
  assert.equal(rows[4].href, '/admin/media');
  assert.equal(rows[4].action, 'Revisar');
});

test('attentionOf incluye subidas fallidas aunque sea la única incidencia', () => {
  const rows = attentionOf({
    ...sample,
    catalogPending: 0,
    priceChanges: 0,
    gamesWithoutSize: 0,
    gamesWithoutCover: 0,
    orphanMedia: 0,
    mediaErrors: 3,
  });
  assert.equal(rows.length, 1);
  assert.match(rows[0].text, /3 subida\(s\) fallida\(s\)/);
  assert.equal(rows[0].href, '/admin/media');
  assert.equal(rows[0].action, 'Reintentar');
});

test('attentionOf recorta a 5 filas como máximo', () => {
  const rows = attentionOf({
    ...sample,
    catalogPending: 1,
    priceChanges: 1,
    gamesWithoutCover: 1,
    orphanMedia: 1,
    mediaErrors: 1,
  });
  assert.equal(rows.length, 5);
});

test('INFRA_ROWS trae las 4 filas de infraestructura', () => {
  assert.equal(INFRA_ROWS.length, 4);
  const names = INFRA_ROWS.map((r) => r.name);
  assert.deepEqual(names, ['Neon / PostgreSQL', 'Prisma', 'Cloudinary', 'API /api/v1']);
  for (const row of INFRA_ROWS) assert.ok(row.detail.length > 0);
});
