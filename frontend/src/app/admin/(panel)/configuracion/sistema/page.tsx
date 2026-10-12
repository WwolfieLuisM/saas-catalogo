'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch } from '@/lib/admin/adminApi';
import { rel } from '@/lib/admin/format';
import { INFRA_ROWS } from '@/lib/admin/dashboardView';
import { navGroupsFor } from '@/lib/admin/nav';
import type { SystemInfo } from '@/lib/admin/types';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { CfgTabs } from '@/components/admin/CfgTabs';
import { AdminIcon } from '@/components/admin/icons';
import { Badge, DeniedBox, ErrorBox, PageHead, Skeleton } from '@/components/admin/ui';

const API_MAP: ReadonlyArray<readonly [string, string, string]> = [
  ['GET', '/api/v1/catalog/version', 'Versión del catálogo público'],
  ['GET', '/api/v1/catalog', 'Catálogo liviano con metadatos'],
  ['GET', '/api/v1/admin/dashboard', 'Estadísticas del panel'],
  ['GET', '/api/v1/admin/system', 'Estado del sistema'],
  ['GET', '/api/v1/admin/config', 'Configuración del negocio'],
  ['POST', '/api/v1/admin/import/preview', 'Vista previa de importación'],
  ['POST', '/api/v1/admin/import/run', 'Importar con confirmación'],
  ['POST', '/api/v1/admin/backups/:id/restore', 'Restaurar copia (SUPER_ADMIN)'],
];

function uptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${seconds} s`;
}

export default function ConfigSistemaPage() {
  const { user } = useAdminAuth();
  const isSa = user?.role === 'SUPER_ADMIN';
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isSa) return;
    let cancelled = false;
    queueMicrotask(() => {
      adminFetch<SystemInfo>('/admin/system')
        .then((data) => {
          if (cancelled) return;
          setInfo(data);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setError(cause instanceof ApiError ? cause.message : 'No se pudo leer el sistema');
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [isSa, retryCount]);

  const panelRoutes = navGroupsFor(user?.role ?? 'ADMIN').flatMap((group) =>
    group.items.map((item) => ({ ...item, group: group.group })),
  );

  if (!isSa) {
    return (
      <>
        <PageHead title="Sistema" sub="Estado del backend, infraestructura y mapa de rutas." />
        <CfgTabs active="sistema" />
        <DeniedBox />
      </>
    );
  }

  return (
    <>
      <PageHead title="Sistema" sub="Estado del backend, infraestructura y mapa de rutas." />
      <CfgTabs active="sistema" />

      {error ? (
        <ErrorBox onRetry={() => setRetryCount((count) => count + 1)} />
      ) : !info ? (
        <Skeleton rows={3} />
      ) : (
        <div className="stats" style={{ marginBottom: 22 }}>
          <div className="st">
            <b>
              {info.status === 'ok' ? (
                <Badge tone="ok">ok</Badge>
              ) : (
                <Badge tone="bd">{info.status}</Badge>
              )}
            </b>
            <span>Estado</span>
          </div>
          <div className="st">
            <b className="mono">{info.database}</b>
            <span>Base de datos</span>
          </div>
          <div className="st">
            <b className="t">{uptime(info.uptimeSeconds)}</b>
            <span>Tiempo activo</span>
          </div>
          <div className="st">
            <b className="mono">{info.nodeVersion}</b>
            <span>Node</span>
          </div>
          <div className="st">
            <b>{info.environment}</b>
            <span>Entorno</span>
          </div>
          <div className="st">
            <b className="t">{rel(info.timestamp)}</b>
            <span>Comprobado</span>
          </div>
        </div>
      )}

      <section>
        <h2 style={{ fontSize: 26, marginBottom: 8 }}>INFRAESTRUCTURA</h2>
        <div className="rows">
          {INFRA_ROWS.map((row) => (
            <div key={row.name}>
              <AdminIcon name="cloud" />
              <div className="gr">
                <b>{row.name}</b>
                <br />
                <small>{row.detail}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="sec">
        <h2>Mapa de rutas y API</h2>
        <details className="fs" style={{ marginBottom: 10 }}>
          <summary>
            Rutas del panel <AdminIcon name="chev" />
          </summary>
          <div className="fb">
            <div className="mono">
              {panelRoutes.map((route) => (
                <div key={route.key}>
                  {route.label} · {route.group}
                </div>
              ))}
            </div>
          </div>
        </details>
        <details className="fs">
          <summary>
            API <AdminIcon name="chev" />
          </summary>
          <div className="fb">
            <div className="rows">
              {API_MAP.map(([method, path, detail]) => (
                <div key={`${method} ${path}`}>
                  <span className="mono" style={{ width: 44 }}>
                    {method}
                  </span>
                  <div className="gr">
                    <span className="mono">{path}</span>
                    <br />
                    <small>{detail}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>
      </section>

      <section className="sec">
        <h2>Plataforma</h2>
        <div className="panel">
          <b>Luismi Platform</b>
          <p className="hint">Plataforma desarrollada y mantenida por Luismi.</p>
        </div>
      </section>
    </>
  );
}
