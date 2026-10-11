import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftFromRule, ruleRangeLabel, validateRules, type RuleDraft } from './pricingRules.ts';

function rule(partial: Partial<RuleDraft>): RuleDraft {
  return { id: null, minSize: 0, maxSize: null, price: 100, active: true, ...partial };
}

test('ruleRangeLabel describe abiertos y cerrados', () => {
  assert.equal(ruleRangeLabel({ minSize: 0, maxSize: null }), 'más de 0 GB');
  assert.equal(ruleRangeLabel({ minSize: 10, maxSize: 50 }), '10 a 50 GB');
});

test('draftFromRule copia el rango y el precio', () => {
  const draft = draftFromRule({
    id: 'r1',
    tenantId: 't1',
    minSize: 5,
    maxSize: 20,
    price: 1500,
    active: true,
  });
  assert.deepEqual(draft, {
    id: 'r1',
    minSize: 5,
    maxSize: 20,
    price: 1500,
    active: true,
  });
});

test('validateRules acepta rangos válidos y solapamientos inactivos', () => {
  const errors = validateRules([
    rule({ minSize: 0, maxSize: 10, price: 100 }),
    rule({ minSize: 11, maxSize: 50, price: 200 }),
    rule({ minSize: 0, maxSize: 5, price: 50, active: false }),
  ]);
  assert.deepEqual(errors, []);
});

test('validateRules rechaza máximo <= mínimo y reglas sin tope en medio', () => {
  const errors = validateRules([
    rule({ minSize: 10, maxSize: 10, price: 1 }),
    rule({ minSize: 0, maxSize: null, price: 2 }),
    rule({ minSize: 1, maxSize: 5, price: 3 }),
    rule({ minSize: -1, maxSize: 2, price: -5 }),
  ]);
  assert.ok(errors.some((e) => e.includes('el máximo debe ser mayor')));
  assert.ok(errors.some((e) => e.includes('sin límite superior')));
  assert.ok(errors.some((e) => e.includes('el mínimo debe ser 0')));
  assert.ok(errors.some((e) => e.includes('el precio no es válido')));
});

test('validateRules detecta solape entre activas ordenadas', () => {
  const errors = validateRules([
    rule({ minSize: 0, maxSize: 20, price: 1 }),
    rule({ minSize: 20, maxSize: 40, price: 2 }),
  ]);
  assert.ok(errors.some((e) => e.includes('Se solapan')));
});
