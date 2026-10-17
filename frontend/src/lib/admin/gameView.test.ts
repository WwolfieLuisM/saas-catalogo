import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SIN_PLATAFORMA, etiquetaPlataforma } from './gameView.ts';

test('muestra la plataforma de la oferta', () => {
  assert.equal(etiquetaPlataforma({ platform: { name: 'PlayStation 5' }, platforms: [] }), 'PlayStation 5');
});

test('cae a los puentes legacy cuando la oferta no trae plataforma resuelta', () => {
  assert.equal(
    etiquetaPlataforma({
      platform: null,
      platforms: [{ name: 'PC' }, { name: 'PS4' }],
    }),
    'PC, PS4',
  );
});

test('no inventa una plataforma cuando no hay ninguna', () => {
  assert.equal(etiquetaPlataforma({ platform: null, platforms: [] }), SIN_PLATAFORMA);
  assert.equal(
    etiquetaPlataforma({ platform: { name: '   ' }, platforms: [] }),
    SIN_PLATAFORMA,
  );
});