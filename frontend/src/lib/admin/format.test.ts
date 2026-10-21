import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dt, fmtSize, hue, ini, nf, rel, shortId, slugify } from './format.ts';

const NOW = Date.parse('2026-10-11T12:00:00Z');

test('rel muestra ahora, minutos, horas y días', () => {
  assert.equal(rel(NOW, NOW), 'ahora');
  assert.equal(rel(NOW - 5 * 60000, NOW), 'hace 5 min');
  assert.equal(rel(NOW - 59 * 60000, NOW), 'hace 59 min');
  assert.equal(rel(NOW - 2 * 3600000, NOW), 'hace 2 h');
  assert.equal(rel(NOW - 20 * 3600000, NOW), 'hace 20 h');
  assert.equal(rel(NOW - 3 * 86400000, NOW), 'hace 3 d');
});

test('rel acepta ISO string y nunca devuelve negativos', () => {
  assert.equal(rel('2026-10-11T11:55:00Z', NOW), 'hace 5 min');
  assert.equal(rel(NOW + 60000, NOW), 'ahora');
});

test('dt formatea fecha y hora en español', () => {
  const out = dt('2026-10-11T12:00:00Z');
  assert.match(out, /2026/);
  assert.match(out, /\d{1,2}:\d{2}/);
});

test('slugify normaliza a minúsculas y guiones', () => {
  assert.equal(slugify('Categoría & Acción'), 'categoria-accion');
  assert.equal(slugify('  Hola   Mundo  '), 'hola-mundo');
  assert.equal(slugify('PS5'), 'ps5');
  assert.equal(slugify(''), '');
  assert.equal(slugify('---'), '');
});

test('shortId recorta a 8 caracteres', () => {
  assert.equal(shortId('c5ce8dd1-2bf7-4ee5-a2a9-b9ea11990428'), 'c5ce8dd1');
  assert.equal(shortId(null), '');
  assert.equal(shortId(undefined), '');
});

test('nf formatea con separador de miles y máximo 2 decimales', () => {
  assert.equal(nf(10), '10');
  assert.equal(nf(1234.5), '1,234.5');
  assert.equal(nf(1234.5678), '1,234.57');
  assert.equal(nf(0), '0');
});

test('fmtSize pinta «—» sin tamaño en vez de «0 GB»', () => {
  assert.equal(fmtSize(null, null), '—');
  assert.equal(fmtSize(null, 'GB'), '—');
  assert.equal(fmtSize(28.8, null), '—');
  assert.equal(fmtSize(undefined, undefined), '—');
});

test('fmtSize formatea el tamaño cuando existe', () => {
  assert.equal(fmtSize(28.8, 'GB'), '28.8 GB');
  assert.equal(fmtSize(0.5, 'GB'), '0.5 GB');
  assert.equal(fmtSize(500, 'MB'), '500 MB');
  assert.equal(fmtSize(0, 'GB'), '0 GB');
});

test('hue deriva un tono estable del texto', () => {
  assert.equal(hue('Hades II'), hue('Hades II'));
  assert.ok(hue('Hades II') >= 0 && hue('Hades II') < 360);
  assert.notEqual(hue('Hades II'), hue('Celeste'));
});

test('ini toma iniciales de hasta dos palabras', () => {
  assert.equal(ini('Hades II'), 'HI');
  assert.equal(ini('celeste'), 'C');
  assert.equal(ini('  Hollow   Knight  '), 'HK');
  assert.equal(ini('???'), '?');
});
