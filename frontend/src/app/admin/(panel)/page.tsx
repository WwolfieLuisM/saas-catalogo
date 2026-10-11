'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AdminIcon } from '@/components/admin/icons';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { adminFetch } from '@/lib/admin/adminApi';
import {
  INFRA_ROWS,
  attentionOf,
  statsOf,
  type DashboardData,
} from '@/lib/admin/dashboardView';
import { ApiError } from '@/lib/api/client';

type DashboardState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: DashboardData };

export default function AdminDashboardPage() {
  const { user, logout } = useAdminAuth();
  const [state, setState] = useState<DashboardState>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      adminFetch<DashboardData>('/admin/dashboard')
        .then((data) => {
          if (!cancelled) setState({ kind: 'ready', data });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          if (error instanceof ApiError && error.status === 401) {
            void logout();
            return;
          }
          setState({
            kind: 'error',
            message:
              error instanceof ApiError
                ? error.message
                : 'No se pudo conectar con el servidor',
          });
        });
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, logout]);

  const retry = () => {
    setState({ kind: 'loading' });
    setAttempt((n) => n + 1);
  };

  if (state.kind === 'loading') {
    return (
      <>
        <div className="ph">
          <div>
            <h1>Hola, {user?.username ?? ''}</h1>
            <p>Cargando resumen…</p>
          </div>
        </div>
        <div className="sk" aria-hidden="true" />
        <div className="sk" aria-hidden="true" />
        <div className="sk" aria-hidden="true" />
        <div className="sk" aria-hidden="true" />
      </>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="state">
        <AdminIcon name="alert" />
        <h3>No se pudo cargar</h3>
        <p>{state.message}</p>
        <button className="btn" type="button" onClick={retry}>
          Reintentar
        </button>
      </div>
    );
  }

  const sa = user?.role === 'SUPER_ADMIN';
  const data = state.data;
  const attention = attentionOf(data);

  return (
    <>
      <div className="ph">
        <div>
          <h1>Hola, {user?.username ?? ''}</h1>
          <p>{sa ? 'Resumen de la plataforma.' : 'Resumen de tu catálogo.'}</p>
        </div>
        <div className="pa">
          <span className={`bd2 ${sa ? 'au' : 'in'}`}>{user?.role ?? ''}</span>
        </div>
      </div>

      <div className="stats">
        {statsOf(data).map(([value, label]) => (
          <div className="st" key={label}>
            <b>{value}</b>
            <span>{label}</span>
          </div>
        ))}
      </div>

      <div className="two sec">
        <section>
          <h2>Requiere atención</h2>
          {attention.length > 0 ? (
            <div className="rows">
              {attention.map((row) => (
                <div key={row.text}>
                  <div className="gr">{row.text}</div>
                  <Link className="btn sm" href={row.href}>
                    {row.action}
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="note ok">Todo al día. No hay pendientes.</div>
          )}
        </section>
        <section>
          <h2>Acciones rápidas</h2>
          <div className="rows">
            <div>
              <div className="gr">Agregar un juego propio</div>
              <Link className="btn sm" href="/admin/juegos/nuevo">
                Crear
              </Link>
            </div>
            <div>
              <div className="gr">Elegir juegos de la biblioteca base</div>
              <Link className="btn sm" href="/admin/biblioteca">
                Explorar
              </Link>
            </div>
            <div>
              <div className="gr">Importar un catálogo</div>
              <Link className="btn sm" href="/admin/configuracion/datos">
                Importar
              </Link>
            </div>
          </div>
        </section>
      </div>

      {sa && (
        <section className="sec">
          <h2>Infraestructura</h2>
          <div className="rows">
            {INFRA_ROWS.map((row) => (
              <div key={row.name}>
                <div className="gr">
                  <b>{row.name}</b>
                  <br />
                  <small>{row.detail}</small>
                </div>
                <span className="bd2 ok">Operativo</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
