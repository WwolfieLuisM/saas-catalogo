'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { login as apiLogin, logout as apiLogout, refreshSession } from '@/lib/admin/adminApi';
import { isSessionUsable, loadSession, type AdminUser } from '@/lib/admin/session';

export type AdminAuthStatus = 'loading' | 'anonymous' | 'authenticated';

interface AdminAuthValue {
  status: AdminAuthStatus;
  user: AdminUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AdminAuthStatus>('loading');
  const [user, setUser] = useState<AdminUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const session = loadSession();
      if (isSessionUsable(session)) {
        if (!cancelled) {
          setUser(session.user);
          setStatus('authenticated');
        }
        return;
      }
      if (session) {
        try {
          const next = await refreshSession();
          if (!cancelled) {
            setUser(next.user);
            setStatus('authenticated');
          }
        } catch {
          if (!cancelled) {
            setUser(null);
            setStatus('anonymous');
          }
        }
        return;
      }
      if (!cancelled) {
        setUser(null);
        setStatus('anonymous');
      }
    };

    queueMicrotask(() => {
      void hydrate();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const session = await apiLogin(username, password);
    setUser(session.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    setUser(null);
    setStatus('anonymous');
    await apiLogout();
  }, []);

  const value = useMemo(
    () => ({ status, user, login, logout }),
    [status, user, login, logout],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth requiere AdminAuthProvider');
  return ctx;
}
