import { Readable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  chunks: Buffer[];
}

const responses = new Map<string, FakeResponse[]>();
const dnsAnswer: string[] = ['93.184.216.34'];
let requestedUrls: string[] = [];

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async () => dnsAnswer.map((address) => ({ address, family: 4 }))),
}));

function respuestaInteja(next: FakeResponse) {
  return Object.assign(
    Readable.from(next.chunks, { objectMode: false }),
    { statusCode: next.statusCode, headers: next.headers },
  );
}

function fakeRequest(run: () => void) {
  const emitter = new EventEmitter();
  return Object.assign(emitter, {
    end: run,
    destroy: (error?: Error) => {
      if (error) emitter.emit('error', error);
    },
  });
}

vi.mock('node:https', () => ({
  request: (
    options: { hostname: string; path: string },
    callback: (response: unknown) => void,
  ) => {
    requestedUrls.push(`${options.hostname}${options.path}`);
    const pending = responses.get(options.hostname) ?? [];
    const next = pending.shift() ?? porDefecto();
    return fakeRequest(() => {
      callback(respuestaInteja(next));
    });
  },
}));

vi.mock('node:http', () => ({
  request: (
    options: { hostname: string; path: string },
    callback: (response: unknown) => void,
  ) => {
    requestedUrls.push(`${options.hostname}${options.path}`);
    const pending = responses.get(options.hostname) ?? [];
    const next = pending.shift() ?? porDefecto();
    return fakeRequest(() => {
      callback(respuestaInteja(next));
    });
  },
}));

function responder(hostname: string, ...queue: FakeResponse[]) {
  responses.set(hostname, queue);
}

function porDefecto(): FakeResponse {
  return { statusCode: 200, headers: { 'content-type': 'image/jpeg' }, chunks: [Buffer.from('imagen-falsa')] };
}

function imagen(bytes: string | number): FakeResponse {
  const payload = typeof bytes === 'number' ? Buffer.alloc(bytes, 1) : Buffer.from(bytes);
  return { statusCode: 200, headers: { 'content-type': 'image/jpeg' }, chunks: [payload] };
}

beforeEach(() => {
  responses.clear();
  requestedUrls = [];
  dnsAnswer.length = 0;
  dnsAnswer.push('93.184.216.34');
});

describe('safeGetImage', () => {
  it('rechaza URLs inválidas sin tocar la red', async () => {
    const { safeGetImage } = await import('../../src/utils/safeUrl.js');

    expect(await safeGetImage('no es una url')).toEqual({
      result: 'error',
      detail: 'URL_INVALIDA',
      buffer: null,
      contentType: null,
      httpStatus: null,
    });
    expect(requestedUrls).toEqual([]);
  });

  it('bloquea protocolos no http(s)', async () => {
    const { safeGetImage } = await import('../../src/utils/safeUrl.js');

    for (const url of ['file:///etc/passwd', 'data:image/png;base64,AAAA']) {
      expect(await safeGetImage(url), url).toMatchObject({
        result: 'blocked',
        detail: 'PROTOCOLO_NO_PERMITIDO',
      });
    }
    expect(requestedUrls).toEqual([]);
  });

  it('bloquea destinos locales y privados antes de resolver DNS', async () => {
    const { safeGetImage } = await import('../../src/utils/safeUrl.js');

    for (const url of [
      'https://localhost/cover.jpg',
      'https://127.0.0.1/cover.jpg',
      'https://169.254.169.254/latest/meta-data/',
      'https://192.168.1.20/cover.jpg',
      'https://10.1.2.3/cover.jpg',
      'https://nas.internal/cover.jpg',
    ]) {
      expect(await safeGetImage(url), url).toMatchObject({
        result: 'blocked',
        detail: 'DESTINO_BLOQUEADO',
      });
    }
    expect(requestedUrls).toEqual([]);
  });

  it('bloquea cuando el hostname público resuelve a una IP privada', async () => {
    dnsAnswer.length = 0;
    dnsAnswer.push('10.0.0.7');
    const { safeGetImage } = await import('../../src/utils/safeUrl.js');

    expect(await safeGetImage('https://imagenes.ejemplo.com/cover.jpg')).toMatchObject({
      result: 'blocked',
      detail: 'DESTINO_BLOQUEADO',
    });
    expect(requestedUrls).toEqual([]);
  });

  it('devuelve el buffer cuando la respuesta es una imagen dentro del tamaño', async () => {
    responder('images.ejemplo.com', imagen('contenido-de-la-portada'));
    const { safeGetImage } = await import('../../src/utils/safeUrl.js');

    const outcome = await safeGetImage('https://images.ejemplo.com/cover.jpg');

    expect(outcome).toMatchObject({
      result: 'ok',
      detail: null,
      contentType: 'image/jpeg',
      httpStatus: 200,
    });
    expect(outcome.buffer?.toString()).toBe('contenido-de-la-portada');
    expect(requestedUrls).toEqual(['images.ejemplo.com/cover.jpg']);
  });

  it('rechaza content-type que no es imagen', async () => {
    responder('images.ejemplo.com', {
      statusCode: 200,
      headers: { 'content-type': 'text/html' },
      chunks: [Buffer.from('<html> phishing </html>')],
    });
    const { safeGetImage } = await import('../../src/utils/safeUrl.js');

    expect(await safeGetImage('https://images.ejemplo.com/cover.jpg')).toMatchObject({
      result: 'error',
      detail: 'CONTENIDO_NO_PERMITIDO',
    });
  });

  it('corta la descarga cuando supera el tamaño máximo', async () => {
    responder('images.ejemplo.com', imagen(2048));
    const { safeGetImage } = await import('../../src/utils/safeUrl.js');

    expect(await safeGetImage('https://images.ejemplo.com/cover.jpg', { maxBytes: 1024 })).toMatchObject(
      { result: 'error', detail: 'DEMASIADO_GRANDE' },
    );
  });

  it('rechaza respuestas de error HTTP', async () => {
    responder('images.ejemplo.com', { statusCode: 404, headers: {}, chunks: [] });
    const { safeGetImage } = await import('../../src/utils/safeUrl.js');

    expect(await safeGetImage('https://images.ejemplo.com/cover.jpg')).toMatchObject({
      result: 'error',
      detail: 'HTTP_404',
      httpStatus: 404,
    });
  });

  it('sigue redirecciones públicas y bloquea las que apuntan a interno', async () => {
    responder('images.ejemplo.com', {
      statusCode: 302,
      headers: { location: 'https://cdn.ejemplo.com/cover.jpg' },
      chunks: [],
    });
    responder('cdn.ejemplo.com', imagen('tras redireccion'));
    const { safeGetImage } = await import('../../src/utils/safeUrl.js');

    const good = await safeGetImage('https://images.ejemplo.com/cover.jpg');
    expect(good.result).toBe('ok');
    expect(good.buffer?.toString()).toBe('tras redireccion');

    responses.clear();
    responder('images.ejemplo.com', {
      statusCode: 302,
      headers: { location: 'http://127.0.0.1:8080/secret' },
      chunks: [],
    });
    const bad = await safeGetImage('https://images.ejemplo.com/cover.jpg');
    expect(bad).toMatchObject({ result: 'blocked', detail: 'DESTINO_BLOQUEADO' });
  });

  it('corta el bucle de redirecciones', async () => {
    responder(
      'loop.ejemplo.com',
      ...Array.from({ length: 5 }, () => ({
        statusCode: 302,
        headers: { location: 'https://loop.ejemplo.com/otra' },
        chunks: [],
      })),
    );
    const { safeGetImage } = await import('../../src/utils/safeUrl.js');

    expect(await safeGetImage('https://loop.ejemplo.com/cover.jpg')).toMatchObject({
      result: 'error',
      detail: 'REDIRECCIONES_EXCESIVAS',
    });
  });
});