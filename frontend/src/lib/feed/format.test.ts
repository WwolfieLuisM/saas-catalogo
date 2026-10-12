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
  // Absolute dates are timezone-stable: 2030-01-15 is far enough that the
  // UTC-midnight parse + ceil never collapses across local offsets.
  const info = formatReleaseInfo('2030-01-15', true);
  assert.ok(info);
  assert.ok(info!.days !== null && info!.days > 1000);
  assert.equal(formatReleaseInfo(null, true)?.days, null);
  assert.equal(formatReleaseInfo('2020-01-01', false), null);
});

test('formatReleaseInfo uses UTC midnight so days is not inflated by local TZ', () => {
  // A date exactly 3 days out from "today" (UTC) must report 3, not 4.
  const today = new Date();
  const target = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 3));
  const iso = target.toISOString().slice(0, 10);
  assert.equal(formatReleaseInfo(iso, true)?.days, 3);
});

test('safeUrl only accepts http(s) or relative', () => {
  assert.equal(safeUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
  assert.equal(safeUrl('/img/a.jpg'), '/img/a.jpg');
  assert.equal(safeUrl('javascript:alert(1)'), '');
  assert.equal(safeUrl(123), '');
});
