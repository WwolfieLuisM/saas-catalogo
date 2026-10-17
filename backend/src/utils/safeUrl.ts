import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

export type UrlCheckResult = {
  result: 'ok' | 'error' | 'timeout' | 'blocked' | 'inconclusive';
  httpStatus: number | null;
  detail: string | null;
};

const DEFAULT_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
]);

const BLOCKED_HOST_SUFFIXES = [
  '.local',
  '.localhost',
  '.internal',
  '.intranet',
  '.corp',
  '.home',
  '.lan',
];

class BlockedDestinationError extends Error {
  constructor() {
    super('DESTINO_BLOQUEADO');
  }
}

class DnsResolutionError extends Error {
  constructor() {
    super('DNS_ERROR');
  }
}

export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return true;
}

function isBlockedV4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return true;
  const octets = parts.map((part) => Number(part));
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return true;
  }
  const [a, b] = octets as [number, number, number, number];
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true;
  return false;
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (/^fe[89ab]/.test(lower)) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice('::ffff:'.length);
    if (isIP(mapped) === 4) return isBlockedV4(mapped);
  }
  return SPECIAL_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

const SPECIAL_IPV6_PREFIXES = [
  '64:ff9b:', // NAT64: puede embeber IPv4 privado (::ffff: no aplica aqui)
  '2002:', // 6to4: transporta IPv4 dentro del payload
  '2001:db8:', // documentacion (RFC 3849)
  '2001:10:', // ORCHID
  '2001:2:', // benchmark (RFC 5180)
  '100:', // discard-only (RFC 6666)
  '3ffe:', // 6bone, retirado
  'fec0:', // site-local obsoleto
];

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) return true;
  const literalFamily = isIP(normalized);
  if (literalFamily !== 0) return isBlockedAddress(normalized);
  return false;
}

interface ResolvedAddress {
  address: string;
  family: number;
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | ResolvedAddress[],
  family?: number,
) => void;

function pinnedLookup(addresses: ResolvedAddress[]) {
  return (
    _hostname: string,
    options: { all?: boolean },
    callback: LookupCallback,
  ): void => {
    if (options.all) {
      callback(null, addresses);
      return;
    }
    const first = addresses[0];
    if (!first) {
      callback(new Error('SIN_DIRECCIONES'), '', undefined);
      return;
    }
    callback(null, first.address, first.family);
  };
}

async function resolveSafeAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const literalFamily = isIP(hostname);
  if (literalFamily !== 0) {
    if (isBlockedAddress(hostname)) throw new BlockedDestinationError();
    return [{ address: hostname, family: literalFamily }];
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new DnsResolutionError();
  }
  if (addresses.length === 0) throw new DnsResolutionError();
  for (const entry of addresses) {
    if (isBlockedAddress(entry.address)) throw new BlockedDestinationError();
  }
  return addresses;
}

function headOnce(
  url: URL,
  addresses: ResolvedAddress[],
  timeoutMs: number,
): Promise<{ status: number; location: string | null }> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = lib(
      {
        method: 'HEAD',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: { 'user-agent': 'JavierCatalog-LinkCheck/1.0', accept: '*/*' },
        lookup: pinnedLookup(addresses),
        timeout: timeoutMs,
      },
      (response) => {
        response.resume();
        resolve({
          status: response.statusCode ?? 0,
          location: response.headers.location ?? null,
        });
      },
    );
    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', (error) => {
      reject(error);
    });
    request.end();
  });
}

export async function safeHeadUrl(
  rawUrl: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<UrlCheckResult> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { result: 'error', httpStatus: null, detail: 'URL_INVALIDA' };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      return { result: 'blocked', httpStatus: null, detail: 'PROTOCOLO_NO_PERMITIDO' };
    }
    if (isBlockedHostname(current.hostname)) {
      return { result: 'blocked', httpStatus: null, detail: 'DESTINO_BLOQUEADO' };
    }

    let addresses: ResolvedAddress[];
    try {
      addresses = await resolveSafeAddresses(current.hostname);
    } catch (error) {
      if (error instanceof BlockedDestinationError) {
        return { result: 'blocked', httpStatus: null, detail: 'DESTINO_BLOQUEADO' };
      }
      return { result: 'error', httpStatus: null, detail: 'DNS_ERROR' };
    }

    let status: number;
    let location: string | null;
    try {
      ({ status, location } = await headOnce(current, addresses, timeoutMs));
    } catch (error) {
      if (error instanceof Error && error.message === 'timeout') {
        return { result: 'timeout', httpStatus: null, detail: 'TIMEOUT' };
      }
      return { result: 'error', httpStatus: null, detail: 'CONEXION_FALLIDA' };
    }

    if (status >= 300 && status < 400 && location) {
      let next: URL;
      try {
        next = new URL(location, current);
      } catch {
        return { result: 'error', httpStatus: status, detail: 'REDIRECT_INVALIDO' };
      }
      current = next;
      continue;
    }

    if (status >= 200 && status < 300) {
      return { result: 'ok', httpStatus: status, detail: null };
    }
    if (status === 405 || status === 501) {
      return { result: 'inconclusive', httpStatus: status, detail: 'HEAD_NO_SOPORTADO' };
    }
    return { result: 'error', httpStatus: status, detail: `HTTP_${status}` };
  }

  return { result: 'error', httpStatus: null, detail: 'REDIRECCIONES_EXCESIVAS' };
}

export type ImageFetchResult = {
  result: 'ok' | 'error' | 'blocked';
  detail: string | null;
  buffer: Buffer | null;
  contentType: string | null;
  httpStatus: number | null;
};

const DEFAULT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_CONTENT_TYPE = /^image\/(jpeg|png|webp|gif|avif)$/i;

export interface SafeGetImageOptions {
  timeoutMs?: number;
  maxBytes?: number;
  userAgent?: string;
}

function getOnce(
  url: URL,
  addresses: ResolvedAddress[],
  timeoutMs: number,
  maxBytes: number,
  userAgent: string,
): Promise<{
  status: number;
  location: string | null;
  contentType: string | null;
  buffer: Buffer;
}> {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = lib(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: { 'user-agent': userAgent, accept: 'image/*' },
        lookup: pinnedLookup(addresses),
        timeout: timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let aborted = false;

        response.on('data', (chunk: Buffer) => {
          if (aborted) return;
          size += chunk.length;
          if (size > maxBytes) {
            aborted = true;
            request.destroy(new Error('too-large'));
            return;
          }
          chunks.push(chunk);
        });

        response.on('end', () => {
          if (aborted) return;
          const status = response.statusCode ?? 0;
          const headers = response.headers ?? {};
          resolve({
            status,
            location: headers.location ?? null,
            contentType: headers['content-type'] ?? null,
            buffer: Buffer.concat(chunks),
          });
        });

        response.on('error', (error: Error) => {
          reject(error);
        });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', (error: Error) => {
      reject(error);
    });
    request.end();
  });
}

export async function safeGetImage(
  rawUrl: string,
  options: SafeGetImageOptions = {},
): Promise<ImageFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_IMAGE_BYTES;
  const userAgent = options.userAgent ?? 'JavierCatalog-CoverFetch/1.0';

  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    return { result: 'error', detail: 'URL_INVALIDA', buffer: null, contentType: null, httpStatus: null };
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (current.protocol !== 'http:' && current.protocol !== 'https:') {
      return {
        result: 'blocked',
        detail: 'PROTOCOLO_NO_PERMITIDO',
        buffer: null,
        contentType: null,
        httpStatus: null,
      };
    }
    if (isBlockedHostname(current.hostname)) {
      return {
        result: 'blocked',
        detail: 'DESTINO_BLOQUEADO',
        buffer: null,
        contentType: null,
        httpStatus: null,
      };
    }

    let addresses: ResolvedAddress[];
    try {
      addresses = await resolveSafeAddresses(current.hostname);
    } catch (error) {
      if (error instanceof BlockedDestinationError) {
        return {
          result: 'blocked',
          detail: 'DESTINO_BLOQUEADO',
          buffer: null,
          contentType: null,
          httpStatus: null,
        };
      }
      return { result: 'error', detail: 'DNS_ERROR', buffer: null, contentType: null, httpStatus: null };
    }

    let fetched: {
      status: number;
      location: string | null;
      contentType: string | null;
      buffer: Buffer;
    };
    try {
      fetched = await getOnce(current, addresses, timeoutMs, maxBytes, userAgent);
    } catch (error) {
      if (error instanceof Error && error.message === 'too-large') {
        return {
          result: 'error',
          detail: 'DEMASIADO_GRANDE',
          buffer: null,
          contentType: null,
          httpStatus: null,
        };
      }
      if (error instanceof Error && error.message === 'timeout') {
        return { result: 'error', detail: 'TIMEOUT', buffer: null, contentType: null, httpStatus: null };
      }
      return {
        result: 'error',
        detail: 'CONEXION_FALLIDA',
        buffer: null,
        contentType: null,
        httpStatus: null,
      };
    }

    if (fetched.status >= 300 && fetched.status < 400 && fetched.location) {
      let next: URL;
      try {
        next = new URL(fetched.location, current);
      } catch {
        return {
          result: 'error',
          detail: 'REDIRECT_INVALIDO',
          buffer: null,
          contentType: null,
          httpStatus: fetched.status,
        };
      }
      current = next;
      continue;
    }

    if (fetched.status < 200 || fetched.status >= 300) {
      return {
        result: 'error',
        detail: `HTTP_${fetched.status}`,
        buffer: null,
        contentType: null,
        httpStatus: fetched.status,
      };
    }

    if (fetched.buffer.length === 0) {
      return {
        result: 'error',
        detail: 'RESPUESTA_VACIA',
        buffer: null,
        contentType: null,
        httpStatus: fetched.status,
      };
    }

    const mediaType = (fetched.contentType ?? '').split(';')[0]?.trim() ?? '';
    if (!IMAGE_CONTENT_TYPE.test(mediaType)) {
      return {
        result: 'error',
        detail: 'CONTENIDO_NO_PERMITIDO',
        buffer: null,
        contentType: null,
        httpStatus: fetched.status,
      };
    }

    return {
      result: 'ok',
      detail: null,
      buffer: fetched.buffer,
      contentType: fetched.contentType,
      httpStatus: fetched.status,
    };
  }

  return {
    result: 'error',
    detail: 'REDIRECCIONES_EXCESIVAS',
    buffer: null,
    contentType: null,
    httpStatus: null,
  };
}
