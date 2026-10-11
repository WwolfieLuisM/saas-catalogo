import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmt,
  gb,
  plural,
  norm,
  hue,
  gradientFor,
  markFor,
  formatRequirements,
  formatReleaseInfo,
  safeUrl,
} from './format.ts';

test('fmt formats numbers with en-US separators', () => {
  assert.equal(fmt(1250), '1,250');
  assert.equal(fmt(0), '0');
});

test('gb rounds to one decimal', () => {
  assert.equal(gb(15.25), '15.3');
  assert.equal(gb(15), '15');
  assert.equal(gb(0.55), '0.6');
});

test('plural handles singular and plural', () => {
  assert.equal(plural(1, 'día', 'días'), '1 día');
  assert.equal(plural(2, 'día', 'días'), '2 días');
});

test('norm strips accents and lowercases', () => {
  assert.equal(norm('Café Múnich'), 'cafe munich');
  assert.equal(norm('Grand Theft Auto VI'), 'grand theft auto vi');
  assert.equal(norm(undefined), '');
});

test('hue is stable and in range', () => {
  const h = hue('hades');
  assert.ok(h >= 0 && h < 360);
  assert.equal(h, hue('hades'));
});

test('gradientFor returns hsl gradient', () => {
  assert.match(gradientFor(40), /linear-gradient/);
  assert.match(gradientFor(40), /hsl\(40/);
});

test('markFor prefers numbers then initials', () => {
  assert.equal(markFor('GTA VI'), 'VI');
  assert.equal(markFor('Hades'), 'HAD');
  assert.equal(markFor(''), 'PC');
});

test('formatRequirements handles string array and object', () => {
  assert.equal(formatRequirements('i5, 8GB'), 'i5, 8GB');
  assert.equal(formatRequirements(['CPU: i5', 'RAM: 8GB']), 'CPU: i5\nRAM: 8GB');
  assert.equal(formatRequirements({ cpu: 'i5', ram: '8GB' }), 'cpu: i5\nram: 8GB');
  assert.match(formatRequirements(null), /No especificados/);
});

test('formatReleaseInfo computes days for soon games', () => {
  const future = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const info = formatReleaseInfo(future, true);
  assert.ok(info);
  assert.equal(info!.days, 3);
  assert.equal(formatReleaseInfo(null, true)?.days, null);
  assert.equal(formatReleaseInfo('2020-01-01', false), null);
});

test('safeUrl only accepts http(s) or relative', () => {
  assert.equal(safeUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.equal(safeUrl('/img/a.jpg'), '/img/a.jpg');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl(123), '');
});
