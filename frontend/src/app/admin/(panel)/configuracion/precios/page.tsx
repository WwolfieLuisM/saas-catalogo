'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch } from '@/lib/admin/adminApi';
import { nf } from '@/lib/admin/dashboardView';
import {
  draftFromRule,
  ruleRangeLabel,
  validateRules,
  type RuleDraft,
} from '@/lib/admin/pricingRules';
import { toast } from '@/lib/admin/toast';
import type { PricingPreview, PricingRule } from '@/lib/admin/types';
import { useTenantScope } from '@/hooks/useTenantScope';
import { CfgTabs } from '@/components/admin/CfgTabs';
import { AdminIcon } from '@/components/admin/icons';
import { Badge, EmptyBox, ErrorBox, Field, PageHead, Skeleton } from '@/components/admin/ui';

function localDraft(partial: Partial<RuleDraft> = {}): RuleDraft {
  return {
    id: null,
    minSize: 0,
    maxSize: null,
    price: 0,
    active: true,
    ...partial,
  };
}

function sameDraft(a: RuleDraft, b: PricingRule): boolean {
  return (
    a.minSize === b.minSize &&
    a.maxSize === b.maxSize &&
    a.price === b.price &&
    a.active === b.active
  );
}

export default function ConfigPreciosPage() {
  const scope = useTenantScope();
  const [saved, setSaved] = useState<PricingRule[]>([]);
  const [draft, setDraft] = useState<RuleDraft[]>([]);
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!scope.ready) return;
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
      adminFetch<PricingRule[]>('/admin/pricing/rules', {
        query: { tenantId: scope.scopeId },
      })
        .then((rules) => {
          setSaved(rules);
          setDraft(rules.map(draftFromRule));
          setPreview(null);
          setLoading(false);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof ApiError ? cause.message : 'No se pudieron cargar las reglas');
          setLoading(false);
        });
    });
  }, [scope.ready, scope.scopeId]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved.map(draftFromRule));
  const errors = validateRules(draft);

  const setRow = (index: number, patch: Partial<RuleDraft>) => {
    setDraft((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const removeRow = (index: number) => {
    setDraft((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setDraft((prev) => [...prev, localDraft({ minSize: prev.length ? 50 : 0 })]);
  };

  const saveRules = () => {
    if (errors.length) return;
    setBusy(true);
    const ops: Promise<unknown>[] = [];
    const deleted = saved.filter((rule) => !draft.some((row) => row.id === rule.id));
    const created = draft.filter((row) => row.id === null);
    const updated = draft.filter((row) => {
      if (!row.id) return false;
      const rule = saved.find((item) => item.id === row.id);
      return rule ? !sameDraft(row, rule) : false;
    });

    deleted.forEach((rule) => {
      ops.push(
        adminFetch(`/admin/pricing/rules/${rule.id}`, {
          method: 'DELETE',
          query: { tenantId: scope.scopeId },
        }),
      );
    });
    created.forEach((row) => {
      ops.push(
        adminFetch<PricingRule>('/admin/pricing/rules', {
          method: 'POST',
          query: { tenantId: scope.scopeId },
          body: {
            minSize: row.minSize,
            maxSize: row.maxSize,
            price: row.price,
            active: row.active,
          },
        }),
      );
    });
    updated.forEach((row) => {
      ops.push(
        adminFetch<PricingRule>(`/admin/pricing/rules/${row.id}`, {
          method: 'PATCH',
          query: { tenantId: scope.scopeId },
          body: {
            minSize: row.minSize,
            maxSize: row.maxSize,
            price: row.price,
            active: row.active,
          },
        }),
      );
    });

    Promise.all(ops)
      .then(() => {
        toast('Reglas guardadas');
        load();
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudieron guardar las reglas', 'bd');
      })
      .finally(() => setBusy(false));
  };

  const discard = () => {
    setDraft(saved.map(draftFromRule));
    setPreview(null);
  };

  const refreshPreview = () => {
    setBusy(true);
    adminFetch<PricingPreview>('/admin/pricing/preview', {
      method: 'POST',
      body: { tenantId: scope.scopeId },
    })
      .then(setPreview)
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo generar la vista previa', 'bd');
      })
      .finally(() => setBusy(false));
  };

  const applyRules = () => {
    setBusy(true);
    adminFetch<{ applied: number; version: number }>('/admin/pricing/apply', {
      method: 'POST',
      body: { tenantId: scope.scopeId },
    })
      .then((result) => {
        toast(
          result.applied
            ? `${nf(result.applied)} precio(s) aplicados · v${result.version}`
            : 'El catálogo ya está al día',
        );
        setPreview(null);
        load();
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudieron aplicar los precios', 'bd');
      })
      .finally(() => setBusy(false));
  };

  return (
    <>
      <PageHead
        title="Precios"
        sub="Cada negocio define sus propios precios por tamaño. Guardar no cambia el catálogo: los precios solo cambian cuando los aplicas."
      />
      <CfgTabs active="precios" />
      {error ? (
        <ErrorBox onRetry={load} />
      ) : loading ? (
        <Skeleton rows={5} />
      ) : (
        <>
          {errors.length ? (
            <div className="note bd" style={{ marginBottom: 16 }}>
              {errors.map((message) => (
                <div key={message}>{message}</div>
              ))}
            </div>
          ) : null}
          <div className="panel">
            {draft.length === 0 ? (
              <EmptyBox title="Sin reglas" text="Agrega la primera regla de precio." />
            ) : (
              draft.map((row, index) => (
                <div
                  key={row.id ?? `local-${index}`}
                  className="grid2"
                  style={{
                    padding: '12px 0',
                    borderBottom: index === draft.length - 1 ? undefined : '1px solid var(--line)',
                    alignItems: 'end',
                  }}
                >
                  <Field label="Desde (GB)">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={row.minSize}
                      onChange={(event) =>
                        setRow(index, { minSize: Number(event.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Hasta (GB)">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder="Sin límite"
                      value={row.maxSize ?? ''}
                      onChange={(event) =>
                        setRow(index, {
                          maxSize: event.target.value === '' ? null : Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                  <Field label="Precio (CUP)">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min="0"
                      value={row.price}
                      onChange={(event) => setRow(index, { price: Number(event.target.value) })}
                    />
                  </Field>
                  <div className="pa" style={{ gap: 12, alignItems: 'center' }}>
                    <span className="swc">
                      <button
                        className="sw"
                        type="button"
                        role="switch"
                        aria-checked={row.active}
                        aria-label={`Activar regla ${index + 1}`}
                        onClick={() => setRow(index, { active: !row.active })}
                      />
                      {row.active ? 'Activa' : 'Inactiva'}
                    </span>
                    <button
                      className="ib dng"
                      type="button"
                      title="Eliminar regla"
                      aria-label={`Eliminar regla ${index + 1}`}
                      onClick={() => removeRow(index)}
                    >
                      <AdminIcon name="trash" />
                    </button>
                  </div>
                </div>
              ))
            )}
            <div className="pa" style={{ marginTop: 16 }}>
              <button className="btn" type="button" onClick={addRow} disabled={busy}>
                <AdminIcon name="plus" />
                Agregar regla
              </button>
              <button
                className={`btn${dirty && !errors.length ? ' pri' : ''}`}
                type="button"
                disabled={!dirty || errors.length > 0 || busy}
                onClick={saveRules}
              >
                <AdminIcon name="check" />
                Guardar reglas
              </button>
              {dirty ? (
                <button className="btn" type="button" disabled={busy} onClick={discard}>
                  Descartar
                </button>
              ) : null}
            </div>
            {dirty ? (
              <p className="hint" style={{ marginTop: 10 }}>
                Tienes cambios sin guardar en las reglas.
              </p>
            ) : null}
          </div>

          <section className="sec">
            <h2>Aplicar al catálogo</h2>
            <p className="d">
              Los juegos con precio manual nunca se tocan. Genera una vista previa antes de aplicar.
            </p>
            <div className="pa" style={{ gap: 8 }}>
              <button
                className="btn"
                type="button"
                disabled={busy || dirty || errors.length > 0}
                onClick={refreshPreview}
              >
                <AdminIcon name="eye" />
                Vista previa
              </button>
              <button
                className="btn pri"
                type="button"
                disabled={busy || dirty || errors.length > 0 || !preview || preview.changeCount === 0}
                onClick={applyRules}
              >
                <AdminIcon name="check" />
                Aplicar nuevas reglas al catálogo
              </button>
            </div>
            {preview ? (
              <div style={{ marginTop: 16 }}>
                <div className="stats">
                  <div className="st">
                    <b>{preview.changeCount}</b>
                    <span>Cambiarían de precio</span>
                  </div>
                  <div className="st">
                    <b>{preview.unchangedCount}</b>
                    <span>Sin cambios</span>
                  </div>
                  <div className="st">
                    <b>{preview.uncoveredCount}</b>
                    <span>Sin regla aplicable</span>
                  </div>
                  <div className="st">
                    <b>{preview.manualCount}</b>
                    <span>Precio manual</span>
                  </div>
                </div>
                {preview.changes.length ? (
                  <div className="list" style={{ marginTop: 16 }}>
                    {preview.changes.slice(0, 8).map((change) => (
                      <div key={change.id} className="li">
                        <div>{change.title}</div>
                        <div>
                          <Badge tone="au">
                            {change.priceFrom === null ? '—' : `${nf(change.priceFrom)} CUP`}
                          </Badge>
                          {' → '}
                          <Badge tone="ok">{nf(change.priceTo)} CUP</Badge>
                        </div>
                        <div>{ruleRangeLabel({ minSize: change.sizeGb, maxSize: null })}</div>
                      </div>
                    ))}
                    {preview.changes.length > 8 ? (
                      <p className="hint" style={{ padding: 10 }}>
                        … y {preview.changes.length - 8} más.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="hint" style={{ marginTop: 12 }}>
                    El catálogo ya está al día con las reglas guardadas.
                  </p>
                )}
                {preview.uncovered.length ? (
                  <div className="note wn" style={{ marginTop: 16 }}>
                    {preview.uncoveredCount} juego(s) no tienen regla aplicable. Su precio no
                    cambiará.
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        </>
      )}
    </>
  );
}
