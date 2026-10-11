'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch } from '@/lib/admin/adminApi';
import { toast } from '@/lib/admin/toast';
import type { DashboardData } from '@/lib/admin/dashboardView';
import type { TenantConfig } from '@/lib/admin/types';
import { useTenantScope } from '@/hooks/useTenantScope';
import { CfgTabs } from '@/components/admin/CfgTabs';
import { ErrorBox, PageHead, Skeleton, Switch } from '@/components/admin/ui';

const UPDATE_STEPS = [
  'Consulta GET /api/v1/catalog/version',
  'Compara con la copia guardada en localStorage',
  'Solo si cambió, descarga GET /api/v1/catalog (solo metadata)',
  'Las imágenes se piden por CDN, en miniatura y con carga diferida',
] as const;

export default function ConfigCatalogoPage() {
  const scope = useTenantScope();
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [dash, setDash] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!scope.ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      Promise.all([
        adminFetch<TenantConfig>('/admin/config', { query: { tenantId: scope.scopeId } }),
        adminFetch<DashboardData>('/admin/dashboard', { query: { tenantId: scope.scopeId } }),
      ])
        .then(([cfg, dashboard]) => {
          if (cancelled) return;
          setConfig(cfg);
          setDash(dashboard);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          setError(cause instanceof ApiError ? cause.message : 'No se pudo cargar el catálogo');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [scope.ready, scope.scopeId]);

  const patchFlag = (key: 'showUnavailable' | 'offerOffline', value: boolean) => {
    setBusy(true);
    adminFetch<TenantConfig>('/admin/config', {
      method: 'PATCH',
      query: { tenantId: scope.scopeId },
      body: { [key]: value },
    })
      .then((data) => {
        setConfig(data);
        toast('Configuración guardada');
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo guardar', 'bd');
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHead title="Catálogo" sub="Versión publicada y visibilidad del catálogo público." />
      <CfgTabs active="catalogo" />
      {error ? (
        <ErrorBox onRetry={() => setError(null)} />
      ) : !config || !dash ? (
        <Skeleton rows={4} />
      ) : (
        <>
          <div className="stats" style={{ marginBottom: 22 }}>
            <div className="st">
              <b>v{dash.catalogVersion ?? 0}</b>
              <span>Versión publicada</span>
            </div>
            <div className="st">
              <b>{dash.totalGames}</b>
              <span>Juegos en el catálogo</span>
            </div>
            <div className="st">
              <b className="t">{dash.availableGames}</b>
              <span>Disponibles</span>
            </div>
          </div>
          <div className="panel">
            <Switch
              checked={config.showUnavailable}
              ariaLabel="Mostrar juegos no disponibles en el catálogo público"
              label="Mostrar juegos no disponibles en el catálogo público"
              onChange={(next) => {
                if (busy) return;
                patchFlag('showUnavailable', next);
              }}
            />
            <div style={{ height: 12 }} />
            <Switch
              checked={config.offerOffline}
              ariaLabel="Ofrecer descarga de imágenes para usar sin conexión"
              label="Ofrecer descarga de imágenes para usar sin conexión"
              onChange={(next) => {
                if (busy) return;
                patchFlag('offerOffline', next);
              }}
            />
          </div>
          <section className="sec">
            <h2>Cómo se actualiza la app pública</h2>
            <p className="d">
              Pensado para conexiones lentas: el catálogo es liviano y las imágenes viajan aparte.
            </p>
            <div className="rows">
              {UPDATE_STEPS.map((step, index) => (
                <div key={step}>
                  <span className="step done">
                    <i>{index + 1}</i>
                  </span>
                  <div className="gr mono">{step}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
