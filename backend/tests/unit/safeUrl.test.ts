import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { isBlockedAddress, isBlockedHostname, safeHeadUrl } from '../../src/utils/safeUrl.js';

describe('isBlockedAddress', () => {
  it('bloquea direcciones IPv4 locales, privadas y de rango reservado', () => {
    const blocked = [
      '0.0.0.0',
      '10.0.0.1',
      '100.64.0.1',
      '127.0.0.1',
      '127.255.255.254',
      '169.254.169.254',
      '172.16.0.1',
      '172.31.255.254',
      '192.0.0.1',
      '192.168.1.1',
      '198.18.0.1',
      '198.19.255.254',
      '224.0.0.1',
      '255.255.255.255',
    ];
    for (const ip of blocked) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('permite direcciones IPv4 públicas', () => {
    const allowed = ['1.1.1.1', '8.8.8.8', '104.16.0.1', '172.32.0.1', '223.255.255.255'];
    for (const ip of allowed) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it('bloquea IPv6 de loopback, enlace local, ULA y mapeadas', () => {
    const blocked = ['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1'];
    for (const ip of blocked) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it('permite IPv6 mapeadas a públicas y direcciones no IP', () => {
    expect(isBlockedAddress('::ffff:8.8.8.8')).toBe(false);
    expect(isBlockedAddress('2001:4860:4860::8888')).toBe(false);
    expect(isBlockedAddress('no-es-ip')).toBe(true);
  });
});

describe('isBlockedHostname', () => {
  it('bloquea localhost y sufijos internos', () => {
    const blocked = [
      'localhost',
      'localhost.',
      'api.local',
      'db.internal',
      'mail.intranet',
      'files.corp',
      'nas.home',
      'router.lan',
      'sub.localhost',
    ];
    for (const hostname of blocked) {
      expect(isBlockedHostname(hostname), hostname).toBe(true);
    }
  });

  it('permite hostnames públicos', () => {
    const allowed = ['images.igdb.com', 'res.cloudinary.com', 'example.com', 'cdn.example.org'];
    for (const hostname of allowed) {
      expect(isBlockedHostname(hostname), hostname).toBe(false);
    }
  });

  it('trata literales IP como direcciones', () => {
    expect(isBlockedHostname('127.0.0.1')).toBe(true);
    expect(isBlockedHostname('192.168.0.10')).toBe(true);
    expect(isBlockedHostname('1.1.1.1')).toBe(false);
  });
});

describe('safeHeadUrl', () => {
  it('rechaza URLs inválidas sin salir de la red', async () => {
    const outcome = await safeHeadUrl('no es una url');
    expect(outcome).toEqual({ result: 'error', httpStatus: null, detail: 'URL_INVALIDA' });
  });

  it('bloquea protocolos no permitidos', async () => {
    const outcome = await safeHeadUrl('ftp://example.com/cover.jpg');
    expect(outcome).toEqual({
      result: 'blocked',
      httpStatus: null,
      detail: 'PROTOCOLO_NO_PERMITIDO',
    });
  });

  it('bloquea hostnames locales y literales privados sin resolver ni conectar', async () => {
    const targets = [
      'http://localhost/cover.jpg',
      'http://127.0.0.1/cover.jpg',
      'http://192.168.1.50/cover.jpg',
      'https://nas.local/cover.jpg',
    ];
    for (const url of targets) {
      const outcome = await safeHeadUrl(url);
      expect(outcome, url).toEqual({
        result: 'blocked',
        httpStatus: null,
        detail: 'DESTINO_BLOQUEADO',
      });
    }
  });

  it('bloquea 127.0.0.1 aunque haya un servidor local real escuchando', async () => {
    const server = createServer((req, res) => {
      res.statusCode = 200;
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;

    try {
      const blocked = await safeHeadUrl(`http://127.0.0.1:${port}/cover.jpg`);
      expect(blocked).toEqual({
        result: 'blocked',
        httpStatus: null,
        detail: 'DESTINO_BLOQUEADO',
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
