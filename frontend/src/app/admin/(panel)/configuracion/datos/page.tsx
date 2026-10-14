'use client';

import { useState } from 'react';
import { CfgTabs } from '@/components/admin/CfgTabs';
import { Badge, PageHead, StateBox } from '@/components/admin/ui';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTenantScope } from '@/hooks/useTenantScope';

type ImportStatus = 'idle' | 'loading' | 'valid' | 'invalid';

interface ImportResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
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

  const canImport = Boolean(user?.role === 'SUPER_ADMIN' || scope.tenantId);

  async function exportFile(kind: 'catalog' | 'media') {
    setNotice(null);
    const qs = scope.tenantId ? `?tenantId=${encodeURIComponent(scope.tenantId)}` : '';
    const endpoint = kind === 'catalog' ? '/admin/export/catalog' : '/admin/export/media-manifest';

    try {
      const response = await fetch(`${endpoint}${qs}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`La exportación falló (${response.status})`);

      const data = await response.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const fallback = kind === 'catalog' ? 'catalogo.json' : 'manifest-multimedia.json';

      download(match?.[1] ?? fallback, blob);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'La exportación falló');
    }
  }

  async function onFileSelected(file: File) {
    setNotice(null);
    setFileName(file.name);
    setStatus('loading');
    setResult(EMPTY_RESULT);

    let catalog: unknown;
    try {
      catalog = JSON.parse(await file.text());
    } catch {
      setStatus('invalid');
      setResult({ valid: false, errors: ['El archivo no es JSON válido'], warnings: [] });
      return;
    }

    try {
      const response = await fetch('/admin/import/validate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId: scope.tenantId || undefined, catalog }),
      });

      const body = (await response.json()) as {
        success?: boolean;
        data?: ImportResult;
        error?: { message?: string };
      };

      if (!response.ok || !body.success || !body.data) {
        setStatus('invalid');
        setResult({
          valid: false,
          errors: [body.error?.message ?? 'El archivo no pudo procesarse'],
          warnings: [],
        });
        return;
      }

      setStatus(body.data.valid ? 'valid' : 'invalid');
      setResult(body.data);
    } catch {
      setStatus('invalid');
      setResult({ valid: false, errors: ['No se pudo contactar con el servidor'], warnings: [] });
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
            <p className="hint">Revisa los avisos y confirma para ejecutar la importación.</p>
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
