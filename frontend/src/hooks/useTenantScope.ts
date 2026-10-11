'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminFetch } from '@/lib/admin/adminApi';
import type { TenantEntry } from '@/lib/admin/types';
import { useAdminAuth } from './useAdminAuth';

const STORAGE_KEY = 'admin.tenantId';

export interface TenantScope {
  isSa: boolean;
  tenants: TenantEntry[] | null;
  tenantId: string;
  scopeId: string | undefined;
  ready: boolean;
  noTenants: boolean;
  loading: boolean;
  error: boolean;
  setTenantId: (id: string) => void;
  reload: () => void;
}

export function useTenantScope(): TenantScope {
  const { user } = useAdminAuth();
  const isSa = user?.role === 'SUPER_ADMIN';
  const [tenants, setTenants] = useState<TenantEntry[] | null>(null);
  const [tenantId, setTenantIdState] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isSa) return;
    let cancelled = false;
    queueMicrotask(() => {
      adminFetch<TenantEntry[]>('/admin/tenants', { query: { limit: 100 } })
        .then((rows) => {
          if (cancelled) return;
          setTenants(rows);
          let saved = '';
          try {
            saved = window.localStorage.getItem(STORAGE_KEY) ?? '';
          } catch {
            saved = '';
          }
          const initial = rows.some((tenant) => tenant.id === saved) ? saved : rows[0]?.id ?? '';
          setTenantIdState(initial);
        })
        .catch(() => {
          if (cancelled) return;
          setTenants([]);
          setError(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [isSa, attempt]);

  const setTenantId = useCallback((id: string) => {
    setTenantIdState(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      return;
    }
  }, []);

  const reload = useCallback(() => {
    setTenants(null);
    setError(false);
    setAttempt((value) => value + 1);
  }, []);

  const resolved = isSa ? tenantId : (user?.tenantId ?? '');
  return {
    isSa,
    tenants,
    tenantId: resolved,
    scopeId: isSa ? tenantId || undefined : undefined,
    ready: isSa ? tenantId !== '' : true,
    noTenants: isSa && tenants !== null && tenants.length === 0,
    loading: isSa && tenants === null && !error,
    error: isSa && error,
    setTenantId,
    reload,
  };
}
