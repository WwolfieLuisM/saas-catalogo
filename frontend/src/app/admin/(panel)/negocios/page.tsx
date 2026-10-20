'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch, adminFetchPaged } from '@/lib/admin/adminApi';
import { slugify } from '@/lib/admin/format';
import { toast } from '@/lib/admin/toast';
import type { TenantEntry, TenantPlatform } from '@/lib/admin/types';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminList } from '@/hooks/useAdminList';
import { AdminIcon } from '@/components/admin/icons';
import {
  Avatar,
  Badge,
  DeniedBox,
  EmptyBox,
  ErrorBox,
  Field,
  ListShell,
  Modal,
  PageHead,
  Pager,
  Skeleton,
} from '@/components/admin/ui';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface TenantCounts {
  games: number;
  admins: number;
}

function NewTenantModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const cleanName = name.trim();
    const cleanSlug = slug.trim();
    if (!cleanName) {
      toast('Escribe el nombre', 'bd');
      return;
    }
    if (cleanSlug.length < 3 || cleanSlug.length > 50 || !SLUG_RE.test(cleanSlug)) {
      toast('Escribe un identificador válido: minúsculas, números y guiones.', 'bd');
      return;
    }
    setBusy(true);
    adminFetch('/admin/tenants', {
      method: 'POST',
      body: { name: cleanName, slug: cleanSlug },
    })
      .then(() => {
        toast('Negocio creado. Invita a su administrador.');
        onSaved();
        onClose();
      })
      .catch((error: unknown) => {
        toast(error instanceof ApiError ? error.message : 'No se pudo crear el negocio', 'bd');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title="Nuevo negocio"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn pri" type="button" onClick={submit} disabled={busy}>
            Crear negocio
          </button>
        </>
      }
    >
      <div className="grid2">
        <Field label="Nombre">
          <input
            value={name}
            maxLength={50}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
          />
        </Field>
        <Field label="Identificador">
          <input
            value={slug}
            maxLength={50}
            placeholder="cliente-b"
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugTouched(true);
            }}
          />
        </Field>
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Se usa en la URL pública del catálogo.
      </p>
    </Modal>
  );
}

type SavePhase = 'saving' | 'saved' | 'error';

function EditTenantModal({
  tenant,
  onClose,
}: {
  tenant: TenantEntry;
  onClose: () => void;
}) {
  const [platforms, setPlatforms] = useState<TenantPlatform[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [phases, setPhases] = useState<Record<string, SavePhase>>({});
  const [retry, setRetry] = useState<{ platformId: string; next: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminFetch<TenantPlatform[]>('/admin/tenant-platforms', {
      query: { tenantId: tenant.id },
    })
      .then((data) => {
        if (cancelled) return;
        setPlatforms(data);
      })
      .catch((error_: unknown) => {
        if (cancelled) return;
        setLoadError(error_ instanceof ApiError ? error_.message : 'No se pudieron cargar las plataformas');
      });
    return () => {
      cancelled = true;
    };
  }, [tenant.id]);

  const apply = (platformId: string, next: boolean) => {
    const current = platforms?.find((p) => p.id === platformId);
    if (!current) return;
    const previous = current.enabled;
    if (savingId) return;
    setSavingId(platformId);
    setPhases((prev) => ({ ...prev, [platformId]: 'saving' }));
    setPlatforms((prev) =>
      prev ? prev.map((p) => (p.id === platformId ? { ...p, enabled: next } : p)) : prev,
    );
    adminFetch(`/admin/tenant-platforms/${platformId}`, {
      method: 'PATCH',
      query: { tenantId: tenant.id },
      body: { enabled: next },
    })
      .then(() => {
        setSavingId(null);
        setRetry(null);
        setPhases((prev) => ({ ...prev, [platformId]: 'saved' }));
      })
      .catch((error_: unknown) => {
        setSavingId(null);
        setPlatforms((prev) =>
          prev ? prev.map((p) => (p.id === platformId ? { ...p, enabled: previous } : p)) : prev,
        );
        setRetry({ platformId, next });
        setPhases((prev) => ({ ...prev, [platformId]: 'error' }));
        toast(error_ instanceof ApiError ? error_.message : 'No se pudo guardar el cambio', 'bd');
      });
  };

  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const remove = () => {
    if (confirmText.trim() !== tenant.slug || deleting) return;
    setDeleting(true);
    adminFetch(`/admin/tenants/${tenant.id}`, { method: 'DELETE' })
      .then(() => {
        toast(`${tenant.name} archivado`);
        onClose();
      })
      .catch((error_: unknown) => {
        setDeleting(false);
        toast(error_ instanceof ApiError ? error_.message : 'No se pudo archivar el negocio', 'bd');
      });
  };

  const enabledCount = platforms?.filter((p) => p.enabled).length ?? 0;
  const showWarning = platforms !== null && enabledCount === 0;

  let body: ReactNode;
  if (loadError) {
    body = <ErrorBox onRetry={onClose} />;
  } else if (platforms === null) {
    body = <Skeleton rows={4} />;
  } else {
    body = (
      <>
        {showWarning ? (
          <div className="note wn">
            Este negocio no tiene ninguna plataforma activa. No podrá recibir ofertas hasta que actives
            al menos una. <b>PC</b> suele ser el punto de partida.
          </div>
        ) : null}
        <div className="rows">
          {platforms.map((platform) => {
            const phase = phases[platform.id];
            return (
              <div key={platform.id}>
                <div className="gr">
                  <b>{platform.name}</b>
                  <small className="mono">{platform.slug}</small>
                </div>
                <div className="ac">
                  {phase === 'error' && retry?.platformId === platform.id ? (
                    <button
                      className="btn sm"
                      type="button"
                      onClick={() => apply(retry.platformId, retry.next)}
                    >
                      Reintentar
                    </button>
                  ) : (
                    <span className="cnt">
                      {phase === 'saving' ? 'Guardando…' : phase === 'saved' ? 'Guardado' : ''}
                    </span>
                  )}
                  <label className="tgl">
                    <input
                      type="checkbox"
                      aria-label={`Plataforma ${platform.name}`}
                      checked={platform.enabled}
                      disabled={savingId !== null}
                      onChange={(e) => apply(platform.id, e.target.checked)}
                    />
                    <span className="trk" aria-hidden="true" />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </>
    );
  }

  return (
    <Modal
      title={`Editar ${tenant.name}`}
      onClose={onClose}
      footer={
        <button className="btn pri" type="button" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <div className="note">
        Identificador <b className="mono">{tenant.slug}</b>. Los cambios se guardan solos.
      </div>
      {body}
      <div className="hr" />
      <div className="note bd">
        <b>Archivar negocio.</b> Se oculta del listado y del feed, deja de servir su catálogo y sus
        administradores pierden el acceso. El borrado es lógico, así que los datos siguen en la base
        de datos y queda registrado en la auditoría, <b>pero no hay forma de recuperarlo desde este
        panel</b>.
      </div>
      {confirming ? (
        <div className="f">
          <label htmlFor="confirm-archivar">
            Escribe <b className="mono">{tenant.slug}</b> para confirmar
          </label>
          <input
            id="confirm-archivar"
            value={confirmText}
            autoComplete="off"
            disabled={deleting}
            onChange={(event) => setConfirmText(event.target.value)}
          />
          <div className="pa">
            <button className="btn" type="button" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancelar
            </button>
            <button
              className="btn dng"
              type="button"
              onClick={remove}
              disabled={confirmText.trim() !== tenant.slug || deleting}
            >
              {deleting ? 'Archivando…' : 'Archivar definitivamente'}
            </button>
          </div>
        </div>
      ) : (
        <button className="btn dng" type="button" onClick={() => setConfirming(true)}>
          Archivar negocio
        </button>
      )}
    </Modal>
  );
}

function NegociosList() {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TenantEntry | null>(null);
  const [counts, setCounts] = useState<Record<string, TenantCounts> | null>(null);

  const { items, meta, error, reload } = useAdminList<TenantEntry>('/admin/tenants', {
    page,
    limit: 20,
  });

  useEffect(() => {
    if (!items) return;
    let cancelled = false;
    queueMicrotask(() => {
      Promise.all(
        items.map(async (tenant) => {
          const [games, admins] = await Promise.all([
            adminFetchPaged('/admin/games', {
              query: { page: 1, limit: 1, tenantId: tenant.id },
            }),
            adminFetchPaged('/admin/administrators', {
              query: { page: 1, limit: 1, tenantId: tenant.id },
            }),
          ]);
          return [tenant.id, { games: games.meta.total, admins: admins.meta.total }] as const;
        }),
      )
        .then((rows) => {
          if (cancelled) return;
          const map: Record<string, TenantCounts> = {};
          for (const [id, value] of rows) map[id] = value;
          setCounts(map);
        })
        .catch(() => {
          if (!cancelled) setCounts(null);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const toggle = (entry: TenantEntry) => {
    adminFetch(`/admin/tenants/${entry.id}`, {
      method: 'PATCH',
      body: { isActive: !entry.isActive },
    })
      .then(() => {
        toast('Estado actualizado');
        reload();
      })
      .catch((error_: unknown) => {
        toast(error_ instanceof ApiError ? error_.message : 'No se pudo cambiar el estado', 'bd');
      });
  };

  const createButton = (
    <button className="btn pri" type="button" onClick={() => setCreating(true)}>
      <AdminIcon name="plus" />
      Nuevo negocio
    </button>
  );

  let content: ReactNode;
  if (error) {
    content = <ErrorBox onRetry={reload} />;
  } else if (items === null) {
    content = <Skeleton rows={5} />;
  } else if (items.length === 0) {
    content = (
      <EmptyBox
        title="Aún no hay negocios"
        text="Crea el primero."
        action={
          <button className="btn" type="button" onClick={() => setCreating(true)}>
            Nuevo negocio
          </button>
        }
      />
    );
  } else {
    content = (
      <>
        <ListShell
          cols="minmax(0,1.6fr) 140px 90px 110px 120px 200px"
          head={['Negocio', 'Identificador', 'Juegos', 'Admins', 'Estado', '']}
        >
          {items.map((entry) => (
            <div className="li" key={entry.id}>
              <div className="pc">
                <Avatar label={entry.name} />
                <div className="nm">
                  <b>{entry.name}</b>
                  <small className="mono">{entry.id}</small>
                </div>
              </div>
              <div data-l="Identificador" className="mono">
                {entry.slug}
              </div>
              <div data-l="Juegos">
                {counts === null ? '—' : (counts?.[entry.id]?.games ?? '…')}
              </div>
              <div data-l="Admins">
                {counts === null ? '—' : (counts?.[entry.id]?.admins ?? '…')}
              </div>
              <div data-l="Estado">
                <Badge tone={entry.isActive ? 'ok' : 'wn'}>
                  {entry.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
              </div>
              <div className="ac">
                <button className="btn sm" type="button" onClick={() => setEditing(entry)}>
                  Editar
                </button>
                <button className="btn sm" type="button" onClick={() => toggle(entry)}>
                  {entry.isActive ? 'Suspender' : 'Activar'}
                </button>
              </div>
            </div>
          ))}
        </ListShell>
        {meta ? <Pager meta={meta} onPage={setPage} /> : null}
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Negocios"
        sub="Clientes de la plataforma. Cada uno tiene datos, precios, multimedia y administradores aislados."
        actions={createButton}
      />
      {content}
      {creating ? <NewTenantModal onClose={() => setCreating(false)} onSaved={reload} /> : null}
      {editing ? <EditTenantModal tenant={editing} onClose={() => setEditing(null)} /> : null}
    </>
  );
}

export default function NegociosPage() {
  const { user } = useAdminAuth();
  if (user?.role !== 'SUPER_ADMIN') return <DeniedBox />;
  return <NegociosList />;
}
