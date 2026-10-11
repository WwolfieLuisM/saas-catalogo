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
};

test('statsOf refleja los 8 campos del DTO en orden', () => {
  const stats = statsOf(sample);
  assert.equal(stats.length, 8);
  assert.deepEqual(stats[0], ['12', 'Juegos en el catálogo']);
  assert.deepEqual(stats[1], ['9', 'Disponibles']);
  assert.deepEqual(stats[2], ['3', 'No disponibles']);
  assert.deepEqual(stats[3], ['4', 'Juegos en biblioteca base']);
  assert.deepEqual(stats[4], ['8', 'Juegos personalizados']);
  assert.deepEqual(stats[5], ['3', 'Sesiones activas']);
  assert.deepEqual(stats[6], ['17', 'Eventos de auditoría (24 h)']);
  assert.deepEqual(stats[7], ['41', 'Versión del catálogo']);
});

test('statsOf muestra — cuando no hay versión de catálogo', () => {
  const stats = statsOf({ ...sample, catalogVersion: null });
  assert.deepEqual(stats[7], ['—', 'Versión del catálogo']);
});

test('nf agrupa millares con coma', () => {
  assert.equal(nf(1234), '1,234');
  assert.equal(nf(0), '0');
  assert.equal(nf(41.5), '41.5');
});

test('attentionOf queda vacío sin incidencias', () => {
  const rows = attentionOf({ ...sample, mediaErrors: 0, orphanMedia: 0 });
  assert.deepEqual(rows, []);
});

test('attentionOf lista huérfanos y subidas fallidas con enlace y acción', () => {
  const rows = attentionOf(sample);
  assert.equal(rows.length, 2);
  assert.match(rows[0].text, /1 archivo\(s\) huérfano\(s\)/);
  assert.equal(rows[0].href, '/admin/media');
  assert.equal(rows[0].action, 'Revisar');
  assert.match(rows[1].text, /2 subida\(s\) fallida\(s\)/);
  assert.equal(rows[1].href, '/admin/media');
  assert.equal(rows[1].action, 'Reintentar');
});

test('INFRA_ROWS trae las 4 filas de infraestructura', () => {
  assert.equal(INFRA_ROWS.length, 4);
  const names = INFRA_ROWS.map((r) => r.name);
  assert.deepEqual(names, ['Neon / PostgreSQL', 'Prisma', 'Cloudinary', 'API /api/v1']);
  for (const row of INFRA_ROWS) assert.ok(row.detail.length > 0);
});
