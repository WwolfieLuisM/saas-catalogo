'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { useAdminAuth } from '@/hooks/useAdminAuth';

export default function AdminLoginPage() {
  const { status, login } = useAdminAuth();
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/admin');
  }, [status, router]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      router.replace('/admin');
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'No se pudo conectar con el servidor',
      );
      setSubmitting(false);
    }
  };

  if (status === 'authenticated') {
    return (
      <div className="adm-splash" role="status" aria-live="polite">
        Entrando…
      </div>
    );
  }

  return (
    <div className="adm-login">
      <main className="adm-card">
        <div className="brand">
          <b>
            Javier <i>PC</i>
          </b>
          <small>Panel de administración</small>
        </div>
        <h1>Entrar</h1>
        <p>Acceso para administradores del catálogo.</p>
        <form onSubmit={onSubmit} noValidate>
          {error ? (
            <p className="adm-err" role="alert">
              {error}
            </p>
          ) : null}
          <div className="f">
            <label htmlFor="adm-user">Usuario</label>
            <input
              id="adm-user"
              name="username"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <div className="f">
            <label htmlFor="adm-pass">Contraseña</label>
            <input
              id="adm-pass"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={submitting}
              required
            />
          </div>
          <button
            className="btn pri"
            type="submit"
            disabled={submitting || !username.trim() || !password}
          >
            {submitting ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </main>
    </div>
  );
}
