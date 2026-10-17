import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  etiquetaOferta,
  hayCambios,
  lineasResumen,
  nombreOferta,
  normalizarPlan,
  puedeEjecutar,
  resumenEjecutado,
  resumenPlan,
  tituloResultado,
} from './catalogImportView.ts';

test('normalizarPlan devuelve un plan vacío si la respuesta no tiene forma', () => {
  assert.deepEqual(normalizarPlan(undefined), { create: [], update: [], delete: [], unchanged: 0 });
  assert.deepEqual(normalizarPlan('texto'), { create: [], update: [], delete: [], unchanged: 0 });
  assert.deepEqual(normalizarPlan({ create: 'no-lista' }), {
    create: [],
    update: [],
    delete: [],
    unchanged: 0,
  });
});

test('normalizarPlan conserva las ofertas y descarta un unchanged negativo', () => {
  const plan = normalizarPlan({
    create: [{ index: 0, title: 'A', slug: 'a-pc', platform: 'pc', availability: true }],
    update: [],
    delete: [],
    unchanged: -3,
  });

  assert.equal(plan.create.length, 1);
  assert.equal(plan.unchanged, 0);
});

test('resumenPlan cuenta cada tipo y suma el total de cambios', () => {
  const resumen = resumenPlan({
    create: [{ index: 0, title: null, slug: 'a-pc', platform: 'pc', availability: true }],
    update: [
      { index: 1, id: '1', title: null, slug: 'b-pc', platform: 'pc', fields: ['price'] },
      { index: 2, id: '2', title: null, slug: 'c-pc', platform: 'pc', fields: [] },
    ],
    delete: [{ id: '3', title: null, slug: 'd-pc' }],
    unchanged: 7,
  });

  assert.deepEqual(resumen, {
    creadas: 1,
    actualizadas: 2,
    eliminadas: 1,
    sinCambios: 7,
    total: 4,
  });
});

test('lineasResumen conjuga en singular y plural y omite los ceros', () => {
  assert.deepEqual(
    lineasResumen({ creadas: 1, actualizadas: 2, eliminadas: 0, sinCambios: 0, total: 3 }),
    ['1 oferta se creará', '2 ofertas se actualizarán'],
  );
  assert.deepEqual(
    lineasResumen({ creadas: 0, actualizadas: 0, eliminadas: 0, sinCambios: 4, total: 0 }),
    [],
  );
});

test('hayCambios distingue un plan que no tocaría nada', () => {
  assert.equal(hayCambios(resumenPlan(normalizarPlan({}))), false);
  assert.equal(
    hayCambios(
      resumenPlan(
        normalizarPlan({
          create: [{ index: 0, title: 'A', slug: 'a-pc', platform: 'pc', availability: true }],
        }),
      ),
    ),
    true,
  );
});

test('nombreOferta cae al slug cuando el título viene vacío', () => {
  assert.equal(nombreOferta({ title: 'Half-Life', slug: 'half-life-pc' }), 'Half-Life');
  assert.equal(nombreOferta({ title: '   ', slug: 'half-life-pc' }), 'half-life-pc');
  assert.equal(nombreOferta({ title: null, slug: 'half-life-pc' }), 'half-life-pc');
});

test('etiquetaOferta añade la plataforma solo cuando viene', () => {
  assert.equal(
    etiquetaOferta({ title: 'Half-Life', slug: 'half-life-pc', platform: 'pc' }),
    'Half-Life · pc',
  );
  assert.equal(etiquetaOferta({ title: null, slug: 'half-life-pc' }), 'half-life-pc');
});

test('resumenEjecutado cuenta lo aplicado en pasado y omite los ceros', () => {
  assert.deepEqual(resumenEjecutado({ created: 3, updated: 1, deleted: 0, unchanged: 12 }), [
    '3 ofertas creadas',
    '1 oferta actualizada',
    '12 ofertas sin cambios',
  ]);
});

test('resumenEjecutado no inventa texto cuando no cambió nada', () => {
  assert.deepEqual(resumenEjecutado({ created: 0, updated: 0, deleted: 0, unchanged: 0 }), [
    'No se aplicó ningún cambio',
  ]);
});

test('tituloResultado distingue una importación real de un no-op', () => {
  assert.equal(
    tituloResultado({ created: 0, updated: 0, deleted: 0, unchanged: 4 }),
    'No había nada que importar',
  );
  assert.equal(tituloResultado({ created: 1, updated: 0, deleted: 0, unchanged: 0 }), 'Importación aplicada');
});

test('puedeEjecutar exige cambios, confirmación y un plan cargado', () => {
  const conCambios = resumenPlan(normalizarPlan({
    create: [{ index: 0, title: 'A', slug: 'a-pc', platform: 'pc', availability: true }],
  }));
  const sinCambios = resumenPlan(normalizarPlan({ unchanged: 3 }));

  assert.equal(puedeEjecutar(conCambios, true), true);
  assert.equal(puedeEjecutar(conCambios, false), false);
  assert.equal(puedeEjecutar(sinCambios, true), false);
});