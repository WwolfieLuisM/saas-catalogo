'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch, adminFetchRaw } from '@/lib/admin/adminApi';
import { toast } from '@/lib/admin/toast';
import type { PageMeta, TenantEntry } from '@/lib/admin/types';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { AdminIcon } from './icons';
import {
  ArtThumb,
  Badge,
  ErrorBox,
  Field,
  FiltersPanel,
  ListShell,
  Pager,
  Skeleton,
  StateBox,
} from './ui';

interface AuditItem {
  id: string;
  tenantId: string;
  gameId: string;
  gameTitle: string | null;
  kind: string;
  status: string;
  url: string | null;
  publicId: string | null;
  hosting: string;
  provider: string | null;
  attention: string[];
  needsAttention: boolean;
}

interface AuditSummary {
  total: number;
  cloudinary: number;
  external: number;
  missingUrl: number;
  missingPublicId: number;
  needsAttention: number;
}

interface AuditEnvelope {
  items: AuditItem[];
  summary: AuditSummary;
}

interface CheckResult {
  id: string;
  result: 'ok' | 'error' | 'timeout' | 'blocked' | 'inconclusive' | 'not_found';
  httpStatus: number | null;
  detail: string | null;
}

interface CheckEnvelope {
  results: CheckResult[];
  summary: Record<string, number>;
  checkedAt: string;
}

const HOSTING_LABELS: Record<string, string> = {
  cloudinary: 'Cloudinary',
  external: 'Externo',
  unknown: 'Sin URL',
};

const HOSTING_TONES: Record<string, string> = {
  cloudinary: 'ok',
  external: 'wn',
  unknown: 'bd',
};

const STATUS_LABELS: Record<string, string> = {
  OK: 'OK',
  PENDING: 'Pendiente',
  ERROR: 'Error',
  ORPHAN: 'Huérfano',
};

const STATUS_TONES: Record<string, string> = {
  OK: 'ok',
  PENDING: 'wn',
  ERROR: 'bd',
  ORPHAN: 'wn',
};

const REASON_LABELS: Record<string, string> = {
  'sin-url': 'Sin URL',
  'sin-public-id': 'Sin publicId',
  'hotlink-externo': 'Hotlink externo',
  'public-id-repetido': 'publicId repetido',
  'patron-url-repetido': 'Posible duplicado',
};

const REASON_TONES: Record<string, string> = {
  'sin-url': 'bd',
  'sin-public-id': 'wn',
  'hotlink-externo': 'wn',
  'public-id-repetido': 'bd',
  'patron-url-repetido': 'wn',
};

const RESULT_LABELS: Record<CheckResult['result'], string> = {
  ok: 'Accesible',
  error: 'Error',
  timeout: 'Timeout',
  blocked: 'Bloqueado',
  inconclusive: 'No concluyente',
  not_found: 'No encontrado',
};

const RESULT_TONES: Record<CheckResult['result'], string> = {
  ok: 'ok',
  error: 'bd',
  timeout: 'wn',
  blocked: 'bd',
  inconclusive: 'wn',
  not_found: 'bd',
};

const CHECKBOX_STYLE = {
  width: 17,
  height: 17,
  minHeight: 0,
  padding: 0,
  accentColor: 'var(--au)',
} as const;

export function MediaAudit() {
  const { user, logout } = useAdminAuth();
  const isSa = user?.role === 'SUPER_ADMIN';
  const [tenants, setTenants] = useState<TenantEntry[] | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [hosting, setHosting] = useState('');
  const [status, setStatus] = useState('');
  const [providerInput, setProviderInput] = useState('');
  const [provider, setProvider] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [checks, setChecks] = useState<Record<string, CheckResult>>({});
  const [checking, setChecking] = useState(false);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((value) => value + 1), []);

  useEffect(() => {
    if (!isSa) return;
    let cancelled = false;
    queueMicrotask(() => {
      adminFetch<TenantEntry[]>('/admin/tenants', { query: { limit: 100 } })
        .then((rows) => {
          if (!cancelled) setTenants(rows);
        })
        .catch(() => {
          if (!cancelled) setTenants([]);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [isSa]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setProvider(providerInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [providerInput]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      adminFetchRaw<{ success: boolean; data?: AuditEnvelope; meta?: PageMeta }>(
        '/admin/media/audit',
        {
          query: {
            page,
            limit: 20,
            tenantId: isSa && tenantId ? tenantId : undefined,
            hosting: hosting || undefined,
            status: status || undefined,
            provider: provider || undefined,
          },
        },
      )
        .then(({ body }) => {
          if (cancelled) return;
          if (!body.data) {
            throw new ApiError('Respuesta inesperada', 200, 'BAD_ENVELOPE');
          }
          setItems(body.data.items);
          setSummary(body.data.summary);
          setMeta(body.meta ?? null);
          setFailed(false);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          if (error instanceof ApiError && error.status === 401) {
            void logout();
            return;
          }
          setItems(null);
          setSummary(null);
          setMeta(null);
          setFailed(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [page, tenantId, hosting, status, provider, tick, isSa, logout]);

  const resetPageAndSelection = (apply: () => void) => {
    apply();
    setPage(1);
    setSelected(new Set());
    setChecks({});
  };

  const toggleOne = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageIds = (items ?? []).map((item) => item.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const togglePage = () => {
    setSelected((current) => {
      if (allPageSelected) {
        const next = new Set(current);
        for (const id of pageIds) next.delete(id);
        return next;
      }
      return new Set([...current, ...pageIds]);
    });
  };

  const runCheck = () => {
    if (checking) return;
    const targets =
      selected.size > 0 ? pageIds.filter((id) => selected.has(id)) : pageIds;
    if (targets.length === 0) {
      toast('No hay recursos en esta página para verificar.', 'bd');
      return;
    }
    if (targets.length > 50) {
      toast('Máximo 50 recursos por verificación.', 'bd');
      return;
    }
    setChecking(true);
    adminFetchRaw<{ success: boolean; data?: CheckEnvelope }>('/admin/media/audit/check', {
      method: 'POST',
      body: { ids: targets },
    })
      .then(({ body }) => {
        if (!body.data) {
          throw new ApiError('Respuesta inesperada', 200, 'BAD_ENVELOPE');
        }
        const map: Record<string, CheckResult> = {};
        for (const result of body.data.results) map[result.id] = result;
        setChecks(map);
        const counts = body.data.summary;
        toast(
          `Verificados ${counts.checked ?? targets.length}: ` +
            `${counts.ok ?? 0} accesibles, ${counts.error ?? 0} con error, ` +
            `${counts.timeout ?? 0} timeouts, ${counts.blocked ?? 0} bloqueados, ` +
            `${counts.inconclusive ?? 0} sin concluir.`,
        );
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          void logout();
          return;
        }
        toast(error instanceof ApiError ? error.message : 'No se pudo verificar', 'bd');
      })
      .finally(() => setChecking(false));
  };

  const stats = summary ? (
    <div className="stats" style={{ marginBottom: 16 }}>
      <div className="st">
        <b>{summary.total}</b>
        <span>Total en el negocio</span>
      </div>
      <div className="st">
        <b>{summary.cloudinary}</b>
        <span>Cloudinary</span>
      </div>
      <div className="st">
        <b>{summary.external}</b>
        <span>Enlaces externos</span>
      </div>
      <div className="st">
        <b>{summary.missingUrl}</b>
        <span>Sin URL</span>
      </div>
      <div className="st">
        <b>{summary.missingPublicId}</b>
        <span>Sin publicId</span>
      </div>
      <div className="st">
        <b>{summary.needsAttention}</b>
        <span>Necesitan atención</span>
      </div>
    </div>
  ) : null;

  const filters = (
    <FiltersPanel open={filtersOpen} onClose={() => setFiltersOpen(false)}>
      {isSa ? (
        <Field label="Negocio">
          <select
            aria-label="Negocio"
            value={tenantId}
            onChange={(event) =>
              resetPageAndSelection(() => setTenantId(event.target.value))
            }
          >
            <option value="">Todos</option>
            {(tenants ?? []).map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Alojamiento">
        <select
          aria-label="Alojamiento"
          value={hosting}
          onChange={(event) => resetPageAndSelection(() => setHosting(event.target.value))}
        >
          <option value="">Todos</option>
          <option value="cloudinary">Cloudinary</option>
          <option value="external">Externo</option>
          <option value="unknown">Sin URL</option>
        </select>
      </Field>
      <Field label="Estado">
        <select
          aria-label="Estado"
          value={status}
          onChange={(event) => resetPageAndSelection(() => setStatus(event.target.value))}
        >
          <option value="">Todos</option>
          <option value="OK">OK</option>
          <option value="PENDING">Pendiente</option>
          <option value="ERROR">Error</option>
          <option value="ORPHAN">Huérfano</option>
        </select>
      </Field>
    </FiltersPanel>
  );

  let content: ReactNode;
  if (failed) {
    content = <ErrorBox onRetry={reload} />;
  } else if (items === null) {
    content = <Skeleton rows={5} />;
  } else if (items.length === 0) {
    content = (
      <StateBox
        icon="image"
        title="Sin recursos"
        text="No hay medios que coincidan con los filtros actuales de este negocio."
      />
    );
  } else {
    content = (
      <>
        <ListShell
          cols="40px minmax(0,2fr) 118px 128px minmax(0,1.5fr) minmax(0,1.5fr)"
          head={['', 'Juego', 'Estado', 'Alojamiento', 'URL', 'Señales']}
        >
          <div className="li" style={{ borderBottom: 0, paddingTop: 4 }}>
            <div>
              <input
                type="checkbox"
                style={CHECKBOX_STYLE}
                aria-label="Seleccionar todos de esta página"
                checked={allPageSelected}
                onChange={togglePage}
              />
            </div>
            <div className="hint">Seleccionar página</div>
            <div />
            <div />
            <div />
            <div />
          </div>
          {items.map((item) => {
            const check = checks[item.id];
            return (
              <div className="li" key={item.id}>
                <div>
                  <input
                    type="checkbox"
                    style={CHECKBOX_STYLE}
                    aria-label={`Seleccionar ${item.gameTitle ?? item.id}`}
                    checked={selected.has(item.id)}
                    onChange={() => toggleOne(item.id)}
                  />
                </div>
                <div className="pc">
                  <span className="th">
                    <ArtThumb title={item.gameTitle ?? '—'} url={item.url} />
                  </span>
                  <div className="nm">
                    <b>{item.gameTitle ?? '—'}</b>
                    <small>{item.kind === 'COVER' ? 'Portada' : 'Captura'}</small>
                  </div>
                </div>
                <div data-l="Estado">
                  <Badge tone={STATUS_TONES[item.status] ?? ''}>
                    {STATUS_LABELS[item.status] ?? item.status}
                  </Badge>
                </div>
                <div data-l="Alojamiento">
                  <Badge tone={HOSTING_TONES[item.hosting] ?? ''}>
                    {HOSTING_LABELS[item.hosting] ?? item.hosting}
                  </Badge>
                </div>
                <div data-l="URL" className="mono" title={item.url ?? ''}>
                  {item.url ? item.url.replace(/^https?:\/\//, '') : '—'}
                </div>
                <div data-l="Señales" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {item.attention.length === 0 && !check ? (
                    <span className="hint">Sin incidencias</span>
                  ) : null}
                  {item.attention.map((reason) => (
                    <Badge key={reason} tone={REASON_TONES[reason] ?? ''}>
                      {REASON_LABELS[reason] ?? reason}
                    </Badge>
                  ))}
                  {check ? (
                    <Badge tone={RESULT_TONES[check.result]}>
                      {RESULT_LABELS[check.result]}
                      {check.httpStatus !== null ? ` · ${check.httpStatus}` : ''}
                    </Badge>
                  ) : null}
                </div>
              </div>
            );
          })}
        </ListShell>
        {meta ? <Pager meta={meta} onPage={setPage} /> : null}
      </>
    );
  }

  return (
    <section className="sec" aria-label="Auditoría de medios">
      <h2>Auditoría de medios</h2>
      <p className="d">
        Inventario de portadas y capturas con su alojamiento. La verificación de enlaces es
        opcional, no guarda cambios y respeta los límites de seguridad del servidor.
      </p>
      {stats}
      <div className="sr">
        <div className="srch" style={{ display: 'flex', gap: 10, flex: 1 }}>
          <input
            value={providerInput}
            placeholder="Filtrar por proveedor (igdb, cloudinary…)"
            aria-label="Filtrar por proveedor"
            onChange={(event) => setProviderInput(event.target.value)}
            style={{ paddingLeft: 12 }}
          />
        </div>
        <button className="btn fbtn" type="button" onClick={() => setFiltersOpen(true)}>
          <AdminIcon name="filter" />
          Filtros
        </button>
        <button
          className="btn pri"
          type="button"
          onClick={runCheck}
          disabled={checking || items === null || items.length === 0}
        >
          <AdminIcon name={checking ? 'refresh' : 'link'} />
          {checking ? 'Verificando…' : 'Verificar accesibilidad'}
        </button>
      </div>
      {filters}
      {content}
    </section>
  );
}
