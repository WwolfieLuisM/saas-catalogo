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
import { ErrorBox, Field, PageHead, Skeleton, roleBadge } from '@/components/admin/ui';

interface SocialLinkDraft {
  label: string;
  url: string;
}

const MAX_SOCIAL_LINKS = 6;

export default function ConfigGeneralPage() {
  const scope = useTenantScope();
  const { user } = useAdminAuth();
  const [config, setConfig] = useState<TenantConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [publicName, setPublicName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [footer, setFooter] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [logo, setLogo] = useState('');
  const [socialLinks, setSocialLinks] = useState<SocialLinkDraft[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!scope.ready) return;
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
          setPhone(data.phone);
          setEmail(data.email);
          setLogo(data.logo);
          setSocialLinks(data.socialLinks);
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
  }, [scope.ready, scope.scopeId]);

  const setLink = (index: number, patch: Partial<SocialLinkDraft>) => {
    setSocialLinks((prev) =>
      prev.map((link, i) => (i === index ? { ...link, ...patch } : link)),
    );
  };

  const submit = () => {
    if (publicName.trim().length > 50) {
      toast('El nombre público supera 50 caracteres', 'bd');
      return;
    }
    const cleaned = socialLinks
      .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
      .filter((link) => link.label !== '' || link.url !== '');
    if (cleaned.some((link) => !link.label || !link.url)) {
      toast('Cada red social necesita etiqueta y URL', 'bd');
      return;
    }
    for (const link of cleaned) {
      try {
        const parsed = new URL(link.url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          toast(`URL inválida: ${link.url}`, 'bd');
          return;
        }
      } catch {
        toast(`URL inválida: ${link.url}`, 'bd');
        return;
      }
    }
    setBusy(true);
    adminFetch<TenantConfig>('/admin/config', {
      method: 'PATCH',
      query: { tenantId: scope.scopeId },
      body: {
        publicName: publicName.trim() || undefined,
        whatsapp: whatsapp.trim(),
        footer: footer.trim(),
        phone: phone.trim(),
        email: email.trim(),
        logo: logo.trim(),
        socialLinks: cleaned,
      },
    })
      .then((data) => {
        setConfig(data);
        setSocialLinks(data.socialLinks);
        toast('Configuración guardada');
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo guardar', 'bd');
      })
      .finally(() => setBusy(false));
  };

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
        <ErrorBox onRetry={() => setError(null)} />
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
            <Field label="Teléfono alterno">
              <input
                name="phone"
                inputMode="tel"
                maxLength={30}
                placeholder="Ej. +53 5 000 0001"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
            <Field label="Email de contacto">
              <input
                name="email"
                type="email"
                maxLength={120}
                placeholder="Ej. contacto@negocio.cu"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
            <Field label="Logo (URL)">
              <input
                name="logo"
                type="url"
                maxLength={300}
                placeholder="https://cdn.ejemplo/logo.png"
                value={logo}
                onChange={(event) => setLogo(event.target.value)}
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
          <Field label={`Redes sociales (hasta ${MAX_SOCIAL_LINKS})`}>
            {socialLinks.map((link, index) => (
              <div
                key={index}
                style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}
              >
                <input
                  aria-label={`Etiqueta de la red ${index + 1}`}
                  placeholder="Etiqueta (Ej. Telegram)"
                  maxLength={30}
                  value={link.label}
                  onChange={(event) => setLink(index, { label: event.target.value })}
                  style={{ flex: '0 0 180px' }}
                />
                <input
                  aria-label={`URL de la red ${index + 1}`}
                  placeholder="https://..."
                  maxLength={300}
                  value={link.url}
                  onChange={(event) => setLink(index, { url: event.target.value })}
                />
                <button
                  className="btn"
                  type="button"
                  aria-label={`Quitar red ${index + 1}`}
                  onClick={() => setSocialLinks((prev) => prev.filter((_, i) => i !== index))}
                >
                  Quitar
                </button>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <button
                className="btn"
                type="button"
                disabled={socialLinks.length >= MAX_SOCIAL_LINKS}
                onClick={() =>
                  setSocialLinks((prev) =>
                    prev.length >= MAX_SOCIAL_LINKS ? prev : [...prev, { label: '', url: '' }],
                  )
                }
              >
                Añadir red social
              </button>
            </div>
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
          <b>Luismi Platform</b>
          <p className="hint">Plataforma desarrollada y mantenida por Luismi. Admin V2.</p>
          <p style={{ marginTop: 8 }}>
            Tenant actual: <b>{config?.tenantId ?? (scope.tenantId || '—')}</b>. Tu rol:{' '}
            {roleBadge(user?.role)}
          </p>
        </div>
      </section>
    </>
  );
}
