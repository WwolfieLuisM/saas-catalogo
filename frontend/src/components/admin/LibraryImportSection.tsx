'use client';

import { useState } from 'react';
import { runLibraryImport, validateLibraryImport } from '@/lib/admin/libraryImportApi';
import { toast } from '@/lib/admin/toast';
import {
  actionLabel,
  actionTone,
  canImport,
  describeImportFailure,
  isUnknownOutcome,
  parseEnvelope,
  taxonomySlugs,
  visibleRecords,
  type Envelope,
  type ImportApplied,
  type ImportPreview,
} from '@/lib/admin/libraryImportView';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { Badge, StateBox } from './ui';

const ROW_LIMIT = 50;

type Phase = 'idle' | 'validating' | 'review' | 'importing' | 'done';

export function LibraryImportSection() {
  const { user } = useAdminAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const [phase, setPhase] = useState<Phase>('idle');
  const [fileName, setFileName] = useState('');
  const [envelope, setEnvelope] = useState<Envelope | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [applied, setApplied] = useState<ImportApplied | null>(null);
  const [problem, setProblem] = useState('');
  const [unknown, setUnknown] = useState(false);

  async function onFileSelected(file: File) {
    setProblem('');
    setUnknown(false);
    setApplied(null);
    setPreview(null);
    setEnvelope(null);
    setFileName(file.name);
    setPhase('validating');

    let parsed: Envelope;
    try {
      parsed = parseEnvelope(await file.text());
    } catch (error) {
      setProblem(describeImportFailure(error));
      setPhase('idle');
      return;
    }

    try {
      const result = await validateLibraryImport(parsed);
      setEnvelope(parsed);
      setPreview(result);
      setPhase('review');
    } catch (error) {
      setProblem(describeImportFailure(error));
      setPhase('idle');
    }
  }

  async function onConfirm() {
    if (!envelope || !preview) return;
    setProblem('');
    setUnknown(false);
    setPhase('importing');

    try {
      const result = await runLibraryImport({
        envelope,
        fingerprint: preview.fingerprint,
        stateFingerprint: preview.stateFingerprint,
      });
      setApplied(result);
      setPhase('done');
      toast(
        `Importación terminada: ${result.summary.create} nuevos, ${result.summary.update} actualizados`,
      );
    } catch (error) {
      setProblem(describeImportFailure(error));
      setUnknown(isUnknownOutcome(error));
      setPhase('review');
    }
  }

  if (!isSuperAdmin) {
    return (
      <section className="panel">
        <h3>Importar biblioteca global</h3>
        <p className="hint">
          Solo un administrador general (SUPER_ADMIN) puede importar la biblioteca global.
        </p>
      </section>
    );
  }

  const busy = phase === 'validating' || phase === 'importing';

  return (
    <section className="panel">
      <h3>Importar biblioteca global</h3>
      <p className="hint">
        Acepta un archivo <code>library-import@2</code>: crea y actualiza juegos de la biblioteca
        (fichas, taxonomía y variantes por plataforma) y descarga sus portadas. No toca las ofertas
        de los tenants. Primero se revisa y luego se confirma; nada se escribe hasta confirmar.
      </p>

      <div className="f">
        <label htmlFor="library-import-file">Archivo JSON del importador</label>
        <input
          id="library-import-file"
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFileSelected(file);
          }}
        />
      </div>

      {phase === 'validating' && (
        <StateBox icon="clock" title="Validando archivo…">
          <p className="hint">{fileName ? `Archivo: ${fileName}` : null}</p>
        </StateBox>
      )}

      {phase === 'importing' && (
        <StateBox icon="clock" title="Importando…">
          <p className="hint">
            Se están descargando y subiendo las portadas: puede tardar un par de minutos. No cierres
            esta página.
          </p>
        </StateBox>
      )}

      {problem && (
        <StateBox icon="alert" title={unknown ? 'Resultado desconocido' : 'No se pudo continuar'}>
          <p>{problem}</p>
        </StateBox>
      )}

      {preview && (
        <>
          <div className="stats" style={{ marginTop: 16 }}>
            <div className="st">
              <b className="t">{preview.summary.total}</b>
              <span>En el archivo</span>
            </div>
            <div className="st">
              <b className="t">{preview.summary.create}</b>
              <span>Nuevos</span>
            </div>
            <div className="st">
              <b className="t">{preview.summary.update}</b>
              <span>Actualizaciones</span>
            </div>
            <div className="st">
              <b className="t">{preview.summary.skip}</b>
              <span>Sin cambios</span>
            </div>
            <div className="st">
              <b className="t">{preview.summary.error}</b>
              <span>Con errores</span>
            </div>
          </div>

          {preview.summary.error > 0 && (
            <div className="note bd" style={{ marginTop: 16 }}>
              <strong>
                {preview.summary.error} registro(s) no se importarán.
              </strong>{' '}
              Los registros válidos sí se aplican. Revisa los errores en la lista.
            </div>
          )}

          {taxonomySlugs(preview).length > 0 && (
            <div className="note wn" style={{ marginTop: 12 }}>
              <strong>Faltan en el diccionario global:</strong>{' '}
              {taxonomySlugs(preview).join(', ')}. Añádelos en la sección de taxonomías antes de
              importar.
            </div>
          )}

          <PreviewTable preview={preview} />

          {phase === 'review' && (
            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button
                className="btn pri"
                type="button"
                disabled={!canImport(preview)}
                onClick={() => void onConfirm()}
              >
                Confirmar importación
              </button>
              {!canImport(preview) && (
                <span className="hint">No hay nada que escribir: todos los registros están iguales.</span>
              )}
            </div>
          )}
        </>
      )}

      {phase === 'done' && applied && <ImportResult applied={applied} />}
    </section>
  );
}

function PreviewTable({ preview }: { preview: ImportPreview }) {
  const { shown, hidden } = visibleRecords(preview.records, ROW_LIMIT);

  return (
    <details className="fs" style={{ marginTop: 16 }} open={preview.summary.error > 0}>
      <summary>Revisar los {preview.records.length} registros</summary>
      <div className="fb">
        <div className="list" style={{ ['--cols' as string]: '28px minmax(0,1fr) 130px 130px minmax(0,1.2fr)' }}>
          <div className="lh">
            <span>#</span>
            <span>Juego</span>
            <span>Acción</span>
            <span>Estado</span>
            <span>Detalle</span>
          </div>
          {shown.map((record) => (
            <div className="li" key={record.index}>
              <span className="mono">{record.index + 1}</span>
              <span className="nm">
                <b>{record.slug ?? '(sin slug)'}</b>
              </span>
              <span data-l="Acción">
                <Badge tone={actionTone(record.action)}>{actionLabel(record.action)}</Badge>
              </span>
              <span data-l="Estado">
                {record.status ? <Badge>{record.status}</Badge> : <span className="hint">—</span>}
              </span>
              <span data-l="Detalle">
                <RecordDetail
                  changes={record.changes}
                  errors={record.errors.map((error) => `${error.code} en ${error.field}: ${error.message}`)}
                />
              </span>
            </div>
          ))}
        </div>
        {hidden > 0 && (
          <p className="hint" style={{ marginTop: 10 }}>
            Se muestran los primeros {shown.length} de {preview.records.length} registros.
          </p>
        )}
      </div>
    </details>
  );
}

function RecordDetail({ changes, errors }: { changes: string[]; errors: string[] }) {
  if (errors.length > 0) {
    return (
      <ul className="hint" style={{ margin: 0, paddingLeft: 18 }}>
        {errors.map((error) => (
          <li key={error}>{error}</li>
        ))}
      </ul>
    );
  }

  if (changes.length === 0) return <span className="hint">Nada que cambiar</span>;

  return (
    <span className="chips">
      {changes.map((change) => (
        <Badge key={change}>{change}</Badge>
      ))}
    </span>
  );
}

function ImportResult({ applied }: { applied: ImportApplied }) {
  return (
    <>
      <StateBox icon="check" title="Importación terminada">
        <p className="hint">
          {applied.summary.create} nuevos, {applied.summary.update} actualizados,{' '}
          {applied.summary.skip} sin cambios, {applied.summary.error} con errores.
        </p>
      </StateBox>

      {applied.warnings.length > 0 && (
        <div className="note wn" style={{ marginTop: 16 }}>
          <strong>{applied.warnings.length} aviso(s):</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {applied.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}