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
  return false;
}

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
