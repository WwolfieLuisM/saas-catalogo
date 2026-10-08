import type { Response } from 'express';
import { getEnv } from '../../config/env.js';
import { parseDurationToSeconds } from '../../utils/duration.js';

export const REFRESH_COOKIE = 'refresh_token';

function refreshCookieOptions() {
  const env = getEnv();

  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/api/v1/auth',
    ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  const env = getEnv();

  res.cookie(REFRESH_COOKIE, token, {
    ...refreshCookieOptions(),
    maxAge: parseDurationToSeconds(env.REFRESH_TOKEN_EXPIRES_IN) * 1000,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
}
