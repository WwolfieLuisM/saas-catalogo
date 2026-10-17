'use client';

import { useState } from 'react';
import { CfgTabs } from '@/components/admin/CfgTabs';
import { Badge, PageHead, StateBox } from '@/components/admin/ui';
import { adminFetch, adminFetchRaw } from '@/lib/admin/adminApi';
import {
  etiquetaOferta,
  hayCambios,
  lineasResumen,
  normalizarPlan,
  puedeEjecutar,
  resumenEjecutado,
  resumenPlan,
  tituloResultado,
  type PlanOfertas,
  type ResultadoImport,
} from '@/lib/admin/catalogImportView';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTenantScope } from '@/hooks/useTenantScope';

type ImportStatus = 'idle' | 'loading' | 'valid' | 'invalid' | 'running' | 'done';

const TIMEOUT_IMPORTACION_MS = 5 * 60 * 1000;

interface ImportResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface PreviewResponse {
  warnings: string[];
  fingerprint: string;
  changes: unknown;
}

interface BackupResponse {
  id: string;
}

const EMPTY_RESULT: ImportResult = { valid: false, errors: [], warnings: [] };

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ConfigDatosPage() {
  const scope = useTenantScope();
  const { user } = useAdminAuth();
  const [status, setStatus] = useState<ImportStatus>('idle');
  const [result, setResult] = useState<ImportResult>(EMPTY_RESULT);
  const [notice, setNotice] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanOfertas | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<unknown>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [ejecutando, setEjecutando] = useState(false);
  const [aplicado, setAplicado] = useState<ResultadoImport | null>(null);

  const canImport = Boolean(user?.role === 'SUPER_ADMIN' || scope.tenantId);

  async function exportFile(kind: 'catalog' | 'media') {
    setNotice(null);
    const endpoint = kind === 'catalog' ? '/admin/export/catalog' : '/admin/export/media-manifest';

    try {
      const { body, filename } = await adminFetchRaw<unknown>(endpoint, {
        query: scope.tenantId ? { tenantId: scope.tenantId } : undefined,
      });
      const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' });
      const fallback = kind === 'catalog' ? 'catalogo.json' : 'manifest-multimedia.json';

      download(filename ?? fallback, blob);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'La exportación falló');
    }
  }

  async function onFileSelected(file: File) {
    setNotice(null);
    setPreviewError(null);
    setPlan(null);
    setCatalog(null);
    setFingerprint(null);
    setConfirmado(false);
    setAplicado(null);
    setRunError(null);
    setFileName(file.name);
    setStatus('loading');
    setResult(EMPTY_RESULT);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setStatus('invalid');
      setResult({ valid: false, errors: ['El archivo no es JSON válido'], warnings: [] });
      return;
    }

    try {
      const data = await adminFetch<ImportResult>('/admin/import/validate', {
        method: 'POST',
        body: { tenantId: scope.tenantId || undefined, catalog: parsed },
      });

      setResult(data);

      if (!data.valid) {
        setStatus('invalid');
        return;
      }

      try {
        const preview = await adminFetch<PreviewResponse>('/admin/import/preview', {
          method: 'POST',
          body: { tenantId: scope.tenantId || undefined, catalog: parsed },
        });

        setPlan(normalizarPlan(preview.changes));
        setFingerprint(preview.fingerprint);
        setCatalog(parsed);
      } catch (error) {
        setPreviewError(
          error instanceof Error
            ? error.message
            : 'No se pudo calcular el plan de importación',
        );
      }

      setStatus('valid');
    } catch (error) {
      setStatus('invalid');
      setResult({
        valid: false,
        errors: [
          error instanceof Error ? error.message : 'El archivo no pudo procesarse',
        ],
        warnings: [],
      });
    }
  }

  async function ejecutarImportacion() {
    if (!catalog || !fingerprint || !plan) return;

    setEjecutando(true);
    setRunError(null);

    try {
      const backup = await adminFetch<BackupResponse>('/admin/import/backup', {
        method: 'POST',
        body: { tenantId: scope.tenantId || undefined },
      });

      const data = await adminFetch<ResultadoImport>('/admin/import/run', {
        method: 'POST',
        timeoutMs: TIMEOUT_IMPORTACION_MS,
        body: {
          tenantId: scope.tenantId || undefined,
          catalog,
          confirm: 'IMPORTAR',
          backupId: backup.id,
          fingerprint,
        },
      });

      setAplicado(data);
      setPlan(null);
      setConfirmado(false);
      setStatus('done');
    } catch (error) {
      setRunError(
        error instanceof Error ? error.message : 'La importación no pudo ejecutarse',
      );
    } finally {
      setEjecutando(false);
    }
  }

  return (
    <>
      <PageHead title="Datos / Importación" sub="Exporta, inspecciona y valida catálogos." />
      <CfgTabs active="datos" />

      {notice && (
        <div className="panel">
          <p className="hint">{notice}</p>
        </div>
      )}

      <section className="panel" style={{ marginBottom: 16 }}>
        <h3>Exportar catálogo</h3>
        <p className="hint">
          Datos de los juegos: fichas, precios, requisitos y taxonomías. Es el archivo que se puede
          volver a importar.
        </p>
        <button className="btn" onClick={() => void exportFile('catalog')}>
          Exportar catálogo
        </button>
      </section>

      <section className="panel" style={{ marginBottom: 16 }}>
        <h3>Exportar manifiesto multimedia</h3>
        <p className="hint">
          Inventario de recursos y sus ubicaciones: portadas y capturas, con su URL, su proveedor y
          su <code>publicId</code> de Cloudinary cuando exista.
        </p>
        <p className="hint">
          <Badge tone="warn">Solo inventario</Badge> Describe qué hay y dónde está.{' '}
          <strong>No se puede importar</strong>: no existe un importador de multimedia. Una URL
          externa solo identifica la ubicación del recurso; no garantiza que siga disponible ni que
          exista una copia recuperable.
        </p>
        <button className="btn" onClick={() => void exportFile('media')}>
          Exportar manifiesto multimedia
        </button>
      </section>

      <section className="panel">
        <h3>Importar catálogo</h3>
        <p className="hint">
          Acepta exclusivamente el formato de catálogo exportado arriba. Un manifiesto multimedia u
          otro JSON sin la lista de juegos será rechazado.
        </p>

        <input
          type="file"
          accept="application/json,.json"
          disabled={!canImport}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFileSelected(file);
          }}
        />

        {status === 'loading' && (
          <StateBox icon="clock" title="Validando archivo…">
            {fileName ? <p className="hint">Archivo: {fileName}</p> : null}
          </StateBox>
        )}

        {status === 'valid' && (
          <StateBox icon="check" title="El archivo es un catálogo válido">
            <p className="hint">Revisa el plan antes de confirmar la importación.</p>
          </StateBox>
        )}

        {status === 'valid' && previewError && (
          <StateBox icon="alert" title="No se pudo calcular el plan de importación">
            <p className="hint">{previewError}</p>
          </StateBox>
        )}

        {status === 'valid' && plan && !previewError && (
          <div aria-live="polite">
            <div className="diff">
              <div>
                <b className="t">{plan.create.length}</b>
                <span>Nuevas</span>
              </div>
              <div>
                <b className="t">{plan.update.length}</b>
                <span>Actualizadas</span>
              </div>
              <div>
                <b className="t">{plan.delete.length}</b>
                <span>Retiradas</span>
              </div>
              <div>
                <b className="t">{plan.unchanged}</b>
                <span>Sin cambios</span>
              </div>
            </div>

            {hayCambios(resumenPlan(plan)) ? (
              <p className="hint">{lineasResumen(resumenPlan(plan)).join(' · ')}</p>
            ) : (
              <p className="hint">
                Este archivo no cambia nada del catálogo actual: todas las ofertas coinciden.
              </p>
            )}

            {plan.create.length > 0 && (
              <details className="fs">
                <summary>
                  Nuevas ofertas <em>({plan.create.length})</em>
                </summary>
                <div className="fb">
                  <div className="list">
                    {plan.create.map((oferta) => (
                      <div className="li" key={`${oferta.index}-${oferta.slug}`}>
                        <span className="gr">{etiquetaOferta(oferta)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}

            {plan.update.length > 0 && (
              <details className="fs">
                <summary>
                  Ofertas actualizadas <em>({plan.update.length})</em>
                </summary>
                <div className="fb">
                  <div className="list">
                    {plan.update.map((oferta) => (
                      <div className="li" key={oferta.id}>
                        <span className="gr">{etiquetaOferta(oferta)}</span>
                        <span className="hint">
                          {oferta.fields.length > 0 ? oferta.fields.join(', ') : 'sin cambios'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}

            {plan.delete.length > 0 && (
              <details className="fs">
                <summary>
                  Ofertas retiradas <em>({plan.delete.length})</em>
                </summary>
                <div className="fb">
                  <div className="note bd">
                    Se retirarán del catálogo. Las ofertas de otras plataformas que no aparezcan en
                    el archivo no se tocan.
                  </div>
                  <div className="list">
                    {plan.delete.map((oferta) => (
                      <div className="li" key={oferta.id}>
                        <span className="gr">{etiquetaOferta(oferta)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            )}

            {puedeEjecutar(resumenPlan(plan), confirmado) && (
              <div className="note wn">
                Antes de ejecutar se creará una copia de seguridad del catálogo. Al terminar podrás
                restaurarla desde la sección de respaldos.
              </div>
            )}

            <label className="tgl" htmlFor="confirmar-importacion">
              <input
                id="confirmar-importacion"
                type="checkbox"
                checked={confirmado}
                disabled={ejecutando}
                onChange={(event) => setConfirmado(event.target.checked)}
              />
              <span className="sw" aria-hidden="true" />
              <span>Confirmo que quiero aplicar estos cambios al catálogo.</span>
            </label>

            <div className="pa">
              <button
                className="btn pri"
                disabled={!puedeEjecutar(resumenPlan(plan), confirmado) || ejecutando}
                onClick={() => void ejecutarImportacion()}
              >
                {ejecutando ? 'Importando…' : 'Ejecutar importación'}
              </button>
            </div>
          </div>
        )}

        {runError && (
          <StateBox icon="alert" title="No se pudo ejecutar la importación">
            <p className="hint">{runError}</p>
          </StateBox>
        )}

        {status === 'running' && (
          <StateBox icon="clock" title="Ejecutando la importación…">
            <p className="hint">
              Puede tardar varios minutos si tiene que descargar portadas. No cierres esta página.
            </p>
          </StateBox>
        )}

        {status === 'done' && aplicado && (
          <StateBox icon="check" title={tituloResultado(aplicado)}>
            <ul>
              {resumenEjecutado(aplicado).map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
          </StateBox>
        )}

        {status === 'invalid' && (
          <StateBox
            icon="alert"
            title={`El archivo no es válido (${result.errors.length} error(es))`}
          >
            <ul>
              {result.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          </StateBox>
        )}

        {result.warnings.length > 0 && (
          <StateBox icon="alert" title={`${result.warnings.length} aviso(s)`}>
            <ul>
              {result.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </StateBox>
        )}
      </section>
    </>
  );
}
