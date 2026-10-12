'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch } from '@/lib/admin/adminApi';
import { toast } from '@/lib/admin/toast';
import type { TenantConfig } from '@/lib/admin/types';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTenantScope } from '@/hooks/useTenantScope';
import { CfgTabs } from '@/components/admin/CfgTabs';
import { AdminIcon } from '@/components/admin/icons';
import { DeniedBox, ErrorBox, Field, PageHead, Skeleton, roleBadge } from '@/components/admin/ui';

export default function ConfigGeneralPage() {
  const scope = useTenantScope();
  const { user } = useAdminAuth();
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publicName, setPublicName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [footer, setFooter] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!scope.isSa || !scope.ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
      adminFetch<TenantConfig>('/admin/config', { query: { tenantId: scope.scopeId } })
        .then((data) => {
          if (cancelled) return;
          setConfig(data);
          setPublicName(data.publicName ?? '');
          setWhatsapp(data.whatsapp);
          setFooter(data.footer);
          setLoading(false);
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          setError(cause instanceof ApiError ? cause.message : 'No se pudo cargar la configuración');
          setLoading(false);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [scope.isSa, scope.ready, scope.scopeId, retryCount]);

  const submit = () => {
    if (!scope.isSa) return;
    if (publicName.trim().length > 50) {
      toast('El nombre público supera 50 caracteres', 'bd');
      return;
    }
    setBusy(true);
    adminFetch<TenantConfig>('/admin/config', {
      method: 'PATCH',
      query: { tenantId: scope.scopeId },
      body: {
        publicName: publicName.trim() || undefined,
        whatsapp: whatsapp.trim(),
        footer: footer.trim(),
      },
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

  if (!scope.isSa) return <DeniedBox />;

  return (
    <>
      <PageHead
        title="General"
        sub={scope.isSa ? `Tenant actual: ${config?.tenantId ?? scope.tenantId}` : undefined}
      />
      <CfgTabs active="general" />
      {!scope.ready ? (
        <Skeleton rows={4} />
      ) : error ? (
        <ErrorBox onRetry={() => setRetryCount((count) => count + 1)} />
      ) : loading || !config ? (
        <Skeleton rows={4} />
      ) : (
        <form
          className="panel"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid2">
            <Field label="Nombre público del negocio">
              <input
                name="publicName"
                maxLength={50}
                value={publicName}
                onChange={(event) => setPublicName(event.target.value)}
              />
            </Field>
            <Field label="WhatsApp de contacto">
              <input
                name="whatsapp"
                inputMode="tel"
                placeholder="Ej. +53 5 000 0000"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
              />
            </Field>
            <Field label="Moneda">
              <input value="CUP" disabled />
            </Field>
            <Field label="Identificador del tenant (asignado por el servidor)">
              <input value={config.tenantId} disabled />
            </Field>
          </div>
          <Field label="Texto al pie del catálogo">
            <input
              name="footer"
              maxLength={120}
              value={footer}
              onChange={(event) => setFooter(event.target.value)}
            />
          </Field>
          <div className="pa" style={{ marginTop: 16 }}>
            <button className="btn pri" type="submit" disabled={busy}>
              <AdminIcon name="check" />
              Guardar cambios
            </button>
          </div>
        </form>
      )}
      <section className="sec">
        <h2>Plataforma</h2>
        <div className="panel">
          <b>JAVIER</b>
          <p className="hint">Plataforma desarrollada y mantenida por Luismi.</p>
          <p style={{ marginTop: 8 }}>
            Tenant actual: <b>{config?.tenantId ?? (scope.tenantId || '—')}</b>. Tu rol:{' '}
            {roleBadge(user?.role)}
          </p>
        </div>
      </section>
    </>
  );
}
