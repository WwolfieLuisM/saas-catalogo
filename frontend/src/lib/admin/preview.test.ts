import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceFor, reqFor, sizeToGb } from './preview.ts';
import type { PricingRule } from './types.ts';

const RULES: PricingRule[] = [
  { id: 'r1', tenantId: null, minSize: 0, maxSize: 10, price: 5, active: true },
  { id: 'r2', tenantId: null, minSize: 10, maxSize: null, price: 9, active: true },
  { id: 'r3', tenantId: null, minSize: 50, maxSize: 60, price: 1, active: false },
];

test('sizeToGb convierte como el backend', () => {
  assert.equal(sizeToGb(500, 'MB'), 0.5);
  assert.equal(sizeToGb(10, 'GB'), 10);
  assert.equal(sizeToGb(2, 'TB'), 2000);
});

test('priceFor elige la primera regla activa que contiene el tamaño', () => {
  assert.equal(priceFor(5, RULES), 5);
  assert.equal(priceFor(10, RULES), 5);
  assert.equal(priceFor(11, RULES), 9);
  assert.equal(priceFor(100, RULES), 9);
  assert.equal(priceFor(55, RULES), 9);
  assert.equal(priceFor(0, RULES), 5);
});

test('priceFor devuelve null sin regla aplicable', () => {
  assert.equal(priceFor(5, []), null);
  const onlyInactive: PricingRule[] = [
    { id: 'x', tenantId: null, minSize: 0, maxSize: null, price: 3, active: false },
  ];
  assert.equal(priceFor(5, onlyInactive), null);
});

test('reqFor escala con el tamaño', () => {
  const small = reqFor(5);
  const medium = reqFor(25);
  const large = reqFor(80);
  assert.equal(small.min.cpu, 'Intel i3');
  assert.equal(medium.min.cpu, 'Intel i5');
  assert.equal(large.min.ram, '12 GB');
  assert.equal(small.rec.ram, '8 GB');
  assert.equal(large.rec.gpu, 'RTX');
  assert.equal(medium.rec.os, 'Windows 10 64-bit');
  assert.equal(medium.min.directX, 'DirectX 11');
});
