'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetchPaged } from '@/lib/admin/adminApi';
import type { PageMeta } from '@/lib/admin/types';
import { useAdminAuth } from './useAdminAuth';

export interface AdminListState<T> {
  items: T[] | null;
  meta: PageMeta | null;
  error: string | null;
}

export function useAdminList<T>(
  path: string,
  query: Record<string, string | number | boolean | undefined> = {},
  options: { enabled?: boolean } = {},
): AdminListState<T> & { reload: () => void } {
  const { logout } = useAdminAuth();
  const [state, setState] = useState<AdminListState<T>>({
    items: null,
    meta: null,
    error: null,
  });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(query);
  const enabled = options.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    queueMicrotask(() => {
      const parsed = JSON.parse(key) as Record<string, string | number | boolean | undefined>;
      adminFetchPaged<T>(path, { query: parsed })
        .then((result) => {
          if (!cancelled) {
            setState({ items: result.data, meta: result.meta, error: null });
          }
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          if (error instanceof ApiError && error.status === 401) {
            void logout();
            return;
          }
          setState({
            items: null,
            meta: null,
            error:
              error instanceof ApiError
                ? error.message
                : 'No se pudo conectar con el servidor',
          });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [path, key, tick, logout, enabled]);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  return { ...state, reload };
}
