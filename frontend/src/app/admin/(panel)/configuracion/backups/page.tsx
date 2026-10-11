'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch, adminFetchPaged } from '@/lib/admin/adminApi';
import { dt, rel } from '@/lib/admin/format';
import { toast } from '@/lib/admin/toast';
import type { BackupEntry } from '@/lib/admin/types';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTenantScope } from '@/hooks/useTenantScope';
import { CfgTabs } from '@/components/admin/CfgTabs';
import { AdminIcon } from '@/components/admin/icons';
import {
  Badge,
  EmptyBox,
  ErrorBox,
  Field,
  ListShell,
  Modal,
  PageHead,
  Pager,
  Skeleton,
} from '@/components/admin/ui';

export default function ConfigBackupsPage() {
  const scope = useTenantScope();
  const { user } = useAdminAuth();
  const isSa = user?.role === 'SUPER_ADMIN';
  const [items, setItems] = useState<BackupEntry[]>([]);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [phrase, setPhrase] = useState('');

  const load = useCallback(() => {
    if (!scope.ready) return;
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
      adminFetchPaged<BackupEntry>('/admin/backups', {
        query: { page, limit: 20, tenantId: scope.scopeId },
      })
        .then((paged) => {
          setItems(paged.data);
          setMeta(paged.meta);
          setLoading(false);
        })
        .catch((cause: unknown) => {
          setError(
            cause instanceof ApiError ? cause.message : 'No se pudieron cargar los backups',
          );
          setLoading(false);
        });
    });
  }, [scope.ready, scope.scopeId, page]);

  useEffect(() => {
    load();
  }, [load]);

  const createBackup = () => {
    setBusy(true);
    adminFetch<BackupEntry>('/admin/backups', {
      method: 'POST',
      body: { type: 'MANUAL', tenantId: scope.scopeId },
    })
      .then(() => {
        toast('Copia creada');
        setPage(1);
        load();
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo crear la copia', 'bd');
      })
      .finally(() => setBusy(false));
  };

  const restore = () => {
    if (!restoreId || phrase !== 'RESTAURAR') return;
    setBusy(true);
    adminFetch(`/admin/backups/${restoreId}/restore`, {
      method: 'POST',
      body: { confirm: 'RESTAURAR' },
    })
      .then(() => {
        toast('Restauración completada');
        setRestoreId(null);
        setPhrase('');
        load();
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo restaurar', 'bd');
      })
      .finally(() => setBusy(false));
  };

  const latest = items[0];

  return (
    <>
      <PageHead
        title="Backups"
        sub="Las copias incluyen datos, catálogo, configuración y el manifest multimedia. Las imágenes físicas de Cloudinary se gestionan aparte."
        actions={
          <button className="btn pri" type="button" disabled={busy} onClick={createBackup}>
            <AdminIcon name="db" />
            Crear copia ahora
          </button>
        }
      />
      <CfgTabs active="backups" />
      {error ? (
        <ErrorBox onRetry={load} />
      ) : loading ? (
        <Skeleton rows={4} />
      ) : (
        <>
          {latest ? (
            <div className="panel">
              <div className="ph" style={{ margin: '0 0 10px' }}>
                <div>
                  <h2 style={{ fontSize: 28 }}>Última copia</h2>
                  <small>
                    {dt(latest.createdAt)}, {rel(latest.createdAt)}
                  </small>
                </div>
                <div>
                  <Badge tone="ok">{latest.status}</Badge> <Badge tone="in">{latest.type}</Badge>{' '}
                  <Badge tone="au">{latest.scope}</Badge>
                </div>
              </div>
              <div className="rows">
                {['Base de datos', 'Catálogo', 'Configuración', 'Manifest multimedia'].map(
                  (label) => (
                    <div key={label}>
                      <div className="gr">{label}</div>
                      <AdminIcon name="check" />
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : (
            <EmptyBox title="Sin copias todavía" text="Crea la primera copia de seguridad." />
          )}

          <section className="sec">
            <h2>Restaurar</h2>
            {isSa ? (
              <p className="d">
                Operación crítica. Se pide confirmación escrita y el backend la registra en
                auditoría.
              </p>
            ) : (
              <div className="note">
                La restauración está reservada a Luismi (SUPER_ADMIN). Si necesitas recuperar
                datos, pídeselo con la fecha de la copia.
              </div>
            )}
          </section>

          <section className="sec">
            <h2>Historial</h2>
            {items.length === 0 ? (
              <EmptyBox title="Sin copias todavía" text="Crea la primera copia de seguridad." />
            ) : (
              <>
                <ListShell
                  cols="170px 140px 150px 110px 130px"
                  head={['Fecha', 'Tipo', 'Alcance', 'Estado', '']}
                >
                  {items.map((backup) => (
                    <div key={backup.id} className="li">
                      <div data-l="Fecha">{dt(backup.createdAt)}</div>
                      <div data-l="Tipo">{backup.type}</div>
                      <div data-l="Alcance">{backup.scope}</div>
                      <div data-l="Estado">
                        <Badge tone="ok">{backup.status}</Badge>
                      </div>
                      <div className="ac">
                        {isSa ? (
                          <button
                            className="btn sm"
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setRestoreId(backup.id);
                              setPhrase('');
                            }}
                          >
                            Restaurar
                          </button>
                        ) : (
                          <span className="hint">
                            <AdminIcon name="lock" /> Solo SUPER_ADMIN
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </ListShell>
                <Pager meta={meta} onPage={setPage} />
              </>
            )}
          </section>

          {restoreId ? (
            <Modal
              title="Restaurar copia"
              onClose={() => setRestoreId(null)}
              footer={
                <>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setRestoreId(null)}
                    disabled={busy}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn pri"
                    type="button"
                    disabled={phrase !== 'RESTAURAR' || busy}
                    onClick={restore}
                  >
                    <AdminIcon name="check" />
                    Restaurar
                  </button>
                </>
              }
            >
              <p>
                Esta operación sobrescribe el estado actual con la copia seleccionada. Escribe{' '}
                <b>RESTAURAR</b> para confirmar.
              </p>
              <Field label="Confirmación">
                <input
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  autoComplete="off"
                  autoFocus
                />
              </Field>
            </Modal>
          ) : null}
        </>
      )}
    </>
  );
}
