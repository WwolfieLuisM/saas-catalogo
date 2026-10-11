import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getToasts, subscribeToasts, toast } from './toast.ts';

test('toast agrega items y notifica a los suscriptores', () => {
  const before = getToasts().length;
  let notified = 0;
  const unsubscribe = subscribeToasts(() => {
    notified += 1;
  });

  toast('Guardado');
  assert.equal(getToasts().length, before + 1);
  assert.equal(getToasts()[before].text, 'Guardado');
  assert.equal(getToasts()[before].kind, '');
  assert.ok(notified >= 1);

  toast('Sin coincidencias', 'bd');
  assert.equal(getToasts()[before + 1].kind, 'bd');

  unsubscribe();
  const countAfter = notified;
  toast('Otro');
  assert.equal(notified, countAfter);
});

test('los toasts se descartan automáticamente', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const before = getToasts().length;
  toast('Temporal');
  assert.equal(getToasts().length, before + 1);
  t.mock.timers.tick(3600);
  assert.equal(getToasts().length, before);
});
