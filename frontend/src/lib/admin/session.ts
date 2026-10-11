export type AdminRole = 'SUPER_ADMIN' | 'ADMIN';

export interface AdminUser {
  id: string;
  username: string;
  role: AdminRole;
  tenantId: string | null;
}

export interface AuthPayload {
  accessToken: string;
  expiresIn: number;
  user: AdminUser;
}

export interface AdminSession {
  accessToken: string;
  expiresAt: number;
  user: AdminUser;
}

export const SESSION_STORAGE_KEY = 'javierpc:admin.session';

export const EXPIRY_SKEW_MS = 5_000;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isValidRole(value: unknown): value is AdminRole {
  return value === 'SUPER_ADMIN' || value === 'ADMIN';
}

function isValidUser(value: unknown): value is AdminUser {
  if (typeof value !== 'object' || value === null) return false;
  const u = value as Record<string, unknown>;
  return (
    typeof u.id === 'string' &&
    u.id.length > 0 &&
    typeof u.username === 'string' &&
    u.username.length > 0 &&
    isValidRole(u.role) &&
    (u.tenantId === null || typeof u.tenantId === 'string')
  );
}

export function sessionFromAuth(payload: AuthPayload, now: number = Date.now()): AdminSession {
  return {
    accessToken: payload.accessToken,
    expiresAt: now + payload.expiresIn * 1000,
    user: payload.user,
  };
}

export function isSessionUsable(
  session: AdminSession | null | undefined,
  now: number = Date.now(),
): session is AdminSession {
  if (!session) return false;
  if (!session.accessToken) return false;
  if (typeof session.expiresAt !== 'number') return false;
  return session.expiresAt - EXPIRY_SKEW_MS > now;
}

export function parseSession(raw: string | null | undefined): AdminSession | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const s = parsed as Record<string, unknown>;
  if (typeof s.accessToken !== 'string' || s.accessToken.length === 0) return null;
  if (typeof s.expiresAt !== 'number' || !Number.isFinite(s.expiresAt)) return null;
  if (!isValidUser(s.user)) return null;
  return { accessToken: s.accessToken, expiresAt: s.expiresAt, user: s.user };
}

export function serializeSession(session: AdminSession): string {
  return JSON.stringify(session);
}

export function loadSession(storage: StorageLike | null = defaultStorage()): AdminSession | null {
  if (!storage) return null;
  return parseSession(storage.getItem(SESSION_STORAGE_KEY));
}

export function saveSession(
  session: AdminSession,
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  storage.setItem(SESSION_STORAGE_KEY, serializeSession(session));
}

export function clearSession(storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  storage.removeItem(SESSION_STORAGE_KEY);
}
