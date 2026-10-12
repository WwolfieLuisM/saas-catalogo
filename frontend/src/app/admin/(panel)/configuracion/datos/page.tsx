'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api/client';
import { adminFetch, adminFetchRaw } from '@/lib/admin/adminApi';
import { nf } from '@/lib/admin/format';
import { toast } from '@/lib/admin/toast';
import type {
  BackupEntry,
  ImportPreviewResult,
  ImportRunResult,
  ImportValidateResult,
} from '@/lib/admin/types';
import { useTenantScope } from '@/hooks/useTenantScope';
import { CfgTabs } from '@/components/admin/CfgTabs';
import { AdminIcon } from '@/components/admin/icons';
import { Badge, PageHead } from '@/components/admin/ui';

type Stage = 'select' | 'validating' | 'invalid' | 'preview' | 'backing' | 'backed' | 'running' | 'done';

const IMP_STEPS = [
  'Seleccionar archivo',
  'Validar',
  'Mostrar errores',
  'Analizar cambios',
  'Vista previa',
  'Crear backup',
  'Confirmar',
  'Importar',
  'Registrar auditoría',
  'Actualizar versión del catálogo',
] as const;

function stepIndex(stage: Stage, hasErrors: boolean): number {
  if (stage === 'select') return 0;
  if (hasErrors) return 2;
  if (stage === 'preview') return 4;
  if (stage === 'backed') return 6;
  if (stage === 'done') return 10;
  return 1;
}

export default function ConfigDatosPage() {
  const scope = useTenantScope();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('select');
  const [fileName, setFileName] = useState('');
  const [catalog, setCatalog] = useState<unknown>(null);
  const [validate, setValidate] = useState<ImportValidateResult | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [backupId, setBackupId] = useState<string | null>(null);
  const [result, setResult] = useState<ImportRunResult | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStage('select');
    setFileName('');
    setCatalog(null);
    setValidate(null);
    setPreview(null);
    setBackupId(null);
    setResult(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const exportUrl = (path: string) => {
    setBusy(true);
    adminFetchRaw<unknown>(path, { query: { tenantId: scope.scopeId } })
      .then(({ body, filename }) => {
        const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename ?? (path.endsWith('media-manifest') ? 'manifest.json' : 'catalogo.json');
        anchor.click();
        URL.revokeObjectURL(url);
        toast('Archivo exportado');
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo exportar', 'bd');
      })
      .finally(() => setBusy(false));
  };

  const onFile = async (file: File) => {
    setFileName(file.name);
    setBusy(true);
    setStage('validating');
    setValidate(null);
    setPreview(null);
    setBackupId(null);
    setResult(null);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        setValidate({ valid: false, errors: ['El archivo no es JSON válido.'], warnings: [] });
        setStage('invalid');
        return;
      }
      setCatalog(parsed);
      const validation = await adminFetch<ImportValidateResult>('/admin/import/validate', {
        method: 'POST',
        body: { catalog: parsed, tenantId: scope.scopeId },
      });
      setValidate(validation);
      if (!validation.valid) {
        setStage('invalid');
        return;
      }
      const diff = await adminFetch<ImportPreviewResult>('/admin/import/preview', {
        method: 'POST',
        body: { catalog: parsed, tenantId: scope.scopeId },
      });
      setPreview(diff);
      setStage('preview');
    } catch (cause: unknown) {
      const message = cause instanceof ApiError ? cause.message : 'No se pudo analizar el archivo';
      setValidate({ valid: false, errors: [message], warnings: [] });
      setStage('invalid');
    } finally {
      setBusy(false);
    }
  };

  const createBackup = () => {
    setBusy(true);
    setStage('backing');
    adminFetch<BackupEntry>('/admin/import/backup', {
      method: 'POST',
      body: { tenantId: scope.scopeId },
    })
      .then((backup) => {
        setBackupId(backup.id);
        setStage('backed');
        toast('Backup creado');
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo crear el backup', 'bd');
        setStage('preview');
      })
      .finally(() => setBusy(false));
  };

  const runImport = () => {
    if (!preview || !backupId) return;
    setBusy(true);
    setStage('running');
    adminFetch<ImportRunResult>('/admin/import/run', {
      method: 'POST',
      body: {
        catalog,
        confirm: 'IMPORTAR',
        backupId,
        fingerprint: preview.fingerprint,
        tenantId: scope.scopeId,
      },
    })
      .then((runResult) => {
        setResult(runResult);
        setStage('done');
        toast('Importación completada');
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo importar', 'bd');
        setStage('backed');
      })
      .finally(() => setBusy(false));
  };

  const errors = validate?.valid === false ? validate.errors : [];
  const previewCounts = preview
    ? {
        create: preview.changes.create.length,
        update: preview.changes.update.length,
        delete: preview.changes.delete.length,
        unchanged: preview.changes.unchanged,
      }
    : null;

  return (
    <>
      <PageHead
        title="Datos / Importación"
        sub="Exporta tu catálogo o impórtalo con revisión previa y copia de seguridad automática."
      />
      <CfgTabs active="datos" />

      <section>
        <h2 style={{ fontSize: 26, marginBottom: 12 }}>EXPORTAR</h2>
        <div className="pa" style={{ gap: 8 }}>
          <button
            className="btn"
            type="button"
            disabled={busy || !scope.ready}
            onClick={() => exportUrl('/admin/export/catalog')}
          >
            <AdminIcon name="download" />
            Exportar catálogo
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy || !scope.ready}
            onClick={() => exportUrl('/admin/export/media-manifest')}
          >
            <AdminIcon name="download" />
            Exportar manifest multimedia
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          El manifest lista las referencias de Cloudinary, no las imágenes.
        </p>
      </section>

      <section className="sec">
        <h2>Importar catálogo</h2>
        <div className="two">
          <div>
            {stage === 'select' || stage === 'validating' ? (
              <div className="panel">
                <p>
                  Elige un archivo <span className="mono">.json</span> exportado desde la
                  plataforma.
                </p>
                <div className="pa" style={{ marginTop: 14 }}>
                  <button
                    className="btn pri"
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    <AdminIcon name="upload" />
                    Seleccionar archivo
                  </button>
                  <button
                    className="btn"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      const sample = {
                        schema: 'luismi-platform/catalog@1',
                        games: [
                          {
                            title: 'Nuevo juego de ejemplo A',
                            genre: 'Acción',
                            category: 'Lanzamientos',
                            platforms: ['PC'],
                            size: 22,
                            year: 2026,
                            available: true,
                          },
                          {
                            title: 'Nuevo juego de ejemplo B',
                            genre: 'Aventura',
                            category: 'Clásicos',
                            platforms: ['PC', 'PS4'],
                            size: 4,
                            year: 2020,
                            available: true,
                          },
                        ],
                      };
                      const file = new File(
                        [JSON.stringify(sample, null, 2)],
                        'catalogo-ejemplo.json',
                        { type: 'application/json' },
                      );
                      void onFile(file);
                    }}
                  >
                    Usar archivo de ejemplo
                  </button>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  disabled={busy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onFile(file);
                  }}
                />
                {stage === 'validating' ? (
                  <p className="hint" style={{ marginTop: 10 }}>
                    Validando y generando vista previa…
                  </p>
                ) : null}
              </div>
            ) : null}

            {errors.length ? (
              <div className="panel">
                <b className="mono">{fileName}</b>
                <div className="note bd" style={{ marginTop: 12 }}>
                  <b>
                    El archivo no es válido ({errors.length} error{errors.length > 1 ? 'es' : ''}
                    ).
                  </b>
                  {errors.slice(0, 12).map((message) => (
                    <div key={message}>{message}</div>
                  ))}
                  {errors.length > 12 ? <div>…</div> : null}
                </div>
                <div className="pa" style={{ marginTop: 12 }}>
                  <button className="btn" type="button" onClick={reset} disabled={busy}>
                    Cancelar
                  </button>
                  <button
                    className="btn pri"
                    type="button"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                  >
                    Elegir otro archivo
                  </button>
                </div>
              </div>
            ) : null}

            {preview && stage !== 'invalid' ? (
              <div className="panel">
                <b className="mono">{fileName}</b>
                <p style={{ margin: '10px 0 0' }}>
                  <Badge tone="ok">Archivo válido</Badge>{' '}
                  <Badge tone="in">{nf(preview.changes.create.length + preview.changes.update.length + preview.changes.delete.length + preview.changes.unchanged)} juegos detectados</Badge>
                </p>
                {validate?.warnings.map((warning) => (
                  <div key={warning} className="note wn" style={{ marginTop: 12 }}>
                    {warning}
                  </div>
                ))}
                {preview.warnings.map((warning) => (
                  <div key={warning} className="note wn" style={{ marginTop: 12 }}>
                    {warning}
                  </div>
                ))}
                {previewCounts ? (
                  <div className="diff" style={{ marginTop: 16 }}>
                    <div>
                      <b style={{ color: 'var(--ok)' }}>+{previewCounts.create}</b>
                      <span>nuevos</span>
                    </div>
                    <div>
                      <b style={{ color: 'var(--au)' }}>~{previewCounts.update}</b>
                      <span>modificados</span>
                    </div>
                    <div>
                      <b style={{ color: 'var(--bd)' }}>−{previewCounts.delete}</b>
                      <span>eliminados</span>
                    </div>
                    <div>
                      <b>={previewCounts.unchanged}</b>
                      <span>sin cambios</span>
                    </div>
                  </div>
                ) : null}

                {preview.changes.create.length ||
                preview.changes.update.length ||
                preview.changes.delete.length ? (
                  <div style={{ marginTop: 12 }}>
                    {preview.changes.create.length ? (
                      <details style={{ marginBottom: 8 }}>
                        <summary style={{ cursor: 'pointer', minHeight: 36, fontWeight: 700 }}>
                          Nuevos ({preview.changes.create.length})
                        </summary>
                        <div className="hint" style={{ padding: '4px 0 8px' }}>
                          {preview.changes.create
                            .slice(0, 10)
                            .map((item) => item.title)
                            .join(' · ')}
                          {preview.changes.create.length > 10 ? ' …' : ''}
                        </div>
                      </details>
                    ) : null}
                    {preview.changes.update.length ? (
                      <details style={{ marginBottom: 8 }}>
                        <summary style={{ cursor: 'pointer', minHeight: 36, fontWeight: 700 }}>
                          Modificados ({preview.changes.update.length})
                        </summary>
                        <div className="hint" style={{ padding: '4px 0 8px' }}>
                          {preview.changes.update
                            .slice(0, 10)
                            .map((item) => `${item.title} (${item.fields.join(', ')})`)
                            .join(' · ')}
                          {preview.changes.update.length > 10 ? ' …' : ''}
                        </div>
                      </details>
                    ) : null}
                    {preview.changes.delete.length ? (
                      <details style={{ marginBottom: 8 }}>
                        <summary style={{ cursor: 'pointer', minHeight: 36, fontWeight: 700 }}>
                          Eliminados (a la papelera) ({preview.changes.delete.length})
                        </summary>
                        <div className="hint" style={{ padding: '4px 0 8px' }}>
                          {preview.changes.delete
                            .slice(0, 10)
                            .map((item) => item.title)
                            .join(' · ')}
                          {preview.changes.delete.length > 10 ? ' …' : ''}
                        </div>
                      </details>
                    ) : null}
                  </div>
                ) : null}

                {stage === 'preview' ? (
                  <>
                    <p className="hint">
                      Antes de importar se crea una copia de seguridad de tu catálogo. Confirma
                      escribiendo IMPORTAR.
                    </p>
                    <div className="pa" style={{ marginTop: 10 }}>
                      <button className="btn" type="button" onClick={reset} disabled={busy}>
                        Cancelar
                      </button>
                      <button
                        className="btn pri"
                        type="button"
                        disabled={busy}
                        onClick={createBackup}
                      >
                        <AdminIcon name="shield" />
                        Crear backup
                      </button>
                    </div>
                  </>
                ) : null}

                {stage === 'backed' ? (
                  <>
                    <div className="note ok" style={{ marginTop: 12 }}>
                      Backup creado. Escribe IMPORTAR para confirmar.
                    </div>
                    <FieldConfirm onConfirm={runImport} disabled={busy} />
                  </>
                ) : null}

                {stage === 'running' ? (
                  <p className="hint" style={{ marginTop: 12 }}>
                    Importando…
                  </p>
                ) : null}

                {stage === 'done' && result ? (
                  <>
                    <div className="note ok" style={{ marginTop: 12 }}>
                      Importación completada. Auditoría registrada. Catálogo en versión{' '}
                      {result.version}.
                    </div>
                    <p className="hint" style={{ marginTop: 8 }}>
                      Creados: {result.created} · Actualizados: {result.updated} · Eliminados:{' '}
                      {result.deleted} · Sin cambios: {result.unchanged}
                    </p>
                    <div className="pa" style={{ marginTop: 10 }}>
                      <button className="btn" type="button" onClick={reset}>
                        Nueva importación
                      </button>
                      <Link className="btn pri" href="/admin/juegos">
                        Ver juegos
                      </Link>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="panel" aria-label="Pasos de importación">
            {IMP_STEPS.map((label, index) => {
              const current = stepIndex(stage, errors.length > 0);
              return (
                <div key={label} className={`step ${index < current ? 'done' : index === current ? 'cur' : ''}`}>
                  <i>{index < current ? '✓' : index + 1}</i>
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}

function FieldConfirm({ onConfirm, disabled }: { onConfirm: () => void; disabled: boolean }) {
  const [phrase, setPhrase] = useState('');
  const ok = phrase === 'IMPORTAR';
  return (
    <div style={{ marginTop: 12 }}>
      <label className="f">
        <span>Escribe IMPORTAR para confirmar</span>
        <input
          value={phrase}
          onChange={(event) => setPhrase(event.target.value)}
          autoComplete="off"
        />
      </label>
      <div className="pa" style={{ marginTop: 10 }}>
        <button className="btn pri" type="button" disabled={!ok || disabled} onClick={onConfirm}>
          <AdminIcon name="check" />
          Confirmar e importar
        </button>
      </div>
    </div>
  );
}
