'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api/client';
import { adminFetch } from '@/lib/admin/adminApi';
import { fetchAllGames, taxonomyCounts } from '@/lib/admin/counts';
import { slugify } from '@/lib/admin/format';
import { toast } from '@/lib/admin/toast';
import type { TaxonomyItem, TenantEntry } from '@/lib/admin/types';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminList } from '@/hooks/useAdminList';
import { AdminIcon } from './icons';
import {
  EmptyBox,
  ErrorBox,
  Field,
  ListShell,
  Modal,
  PageHead,
  Pager,
  Skeleton,
} from './ui';

export interface TaxonomyPageConfig {
  kind: 'category' | 'genre' | 'platform';
  title: string;
  one: string;
  api: string;
  sub: string;
  emptyText: string;
  editable: boolean;
}

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ModalState = { mode: 'create' } | { mode: 'edit'; item: TaxonomyItem } | null;

function TaxonomyFormModal({
  config,
  item,
  tenantId,
  onClose,
  onSaved,
}: {
  config: TaxonomyPageConfig;
  item: TaxonomyItem | null;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = item !== null;
  const [name, setName] = useState(item?.name ?? '');
  const [slug, setSlug] = useState(item?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [description, setDescription] = useState(item?.description ?? '');
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const cleanName = name.trim();
    const cleanSlug = slug.trim();
    if (cleanName.length < 2 || cleanName.length > 100) {
      toast('Escribe un nombre válido (2 a 100 caracteres).', 'bd');
      return;
    }
    if (cleanSlug.length < 3 || cleanSlug.length > 50 || !SLUG_RE.test(cleanSlug)) {
      toast('Escribe un slug válido: minúsculas, números y guiones.', 'bd');
      return;
    }
    setBusy(true);
    const body = { name: cleanName, slug: cleanSlug, description: description.trim() || null };
    const request =
      editing && item
        ? adminFetch(`${config.api}/${item.id}`, { method: 'PATCH', body })
        : adminFetch(config.api, {
            method: 'POST',
            body: { ...body, ...(tenantId ? { tenantId } : {}) },
          });
    request
      .then(() => {
        toast(editing ? 'Guardado' : 'Agregado');
        onSaved();
        onClose();
      })
      .catch((error: unknown) => {
        toast(error instanceof ApiError ? error.message : 'No se pudo guardar', 'bd');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title={editing ? `Editar ${config.one}` : `Agregar ${config.one}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn pri" type="button" onClick={submit} disabled={busy}>
            {editing ? 'Guardar' : 'Agregar'}
          </button>
        </>
      }
    >
      <div className="f" style={{ gap: 14 }}>
        <Field label="Nombre">
          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!slugTouched) setSlug(slugify(event.target.value));
            }}
          />
        </Field>
        <Field label="Slug">
          <input
            value={slug}
            placeholder="mi-categoria"
            onChange={(event) => {
              setSlug(event.target.value);
              setSlugTouched(true);
            }}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            value={description}
            maxLength={500}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

export function TaxonomyPage({ config }: { config: TaxonomyPageConfig }) {
  const { user } = useAdminAuth();
  const isSa = user?.role === 'SUPER_ADMIN';
  const [tenants, setTenants] = useState<TenantEntry[] | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<Record<string, number> | null | undefined>(undefined);
  const [modal, setModal] = useState<ModalState>(null);
  const [removing, setRemoving] = useState<TaxonomyItem | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);
  const needsTenant = isSa;
  const ready = !needsTenant || tenantId !== '';

  useEffect(() => {
    if (!needsTenant) return;
    let cancelled = false;
    queueMicrotask(() => {
      adminFetch<TenantEntry[]>('/admin/tenants', { query: { limit: 100 } })
        .then((rows) => {
          if (cancelled) return;
          setTenants(rows);
          setTenantId((current) => current || rows[0]?.id || '');
        })
        .catch(() => {
          if (!cancelled) setTenants([]);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [needsTenant]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      fetchAllGames(needsTenant ? tenantId : undefined)
        .then((games) => {
          if (!cancelled) setCounts(taxonomyCounts(games, config.kind));
        })
        .catch(() => {
          if (!cancelled) setCounts(null);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [config.kind, needsTenant, ready, tenantId]);

  const { items, meta, error, reload } = useAdminList<TaxonomyItem>(
    config.api,
    {
      page,
      limit: 20,
      sort: '-createdAt',
      tenantId: needsTenant ? tenantId : undefined,
    },
    { enabled: ready },
  );

  const sub = needsTenant
    ? `${config.sub} Pertenecen solo al negocio seleccionado.`
    : `${config.sub} Pertenecen solo a tu negocio.`;

  const actions = (
    <>
      {needsTenant && tenants ? (
        <select
          aria-label="Negocio"
          value={tenantId}
          onChange={(event) => {
            setTenantId(event.target.value);
            setPage(1);
          }}
        >
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </select>
      ) : null}
      {config.editable ? (
        <button className="btn pri" type="button" onClick={() => setModal({ mode: 'create' })}>
          <AdminIcon name="plus" />
          Agregar {config.one}
        </button>
      ) : null}
    </>
  );

  const onRemove = (row: TaxonomyItem) => {
    const count = counts ? (counts[row.id] ?? 0) : 0;
    if (counts && count > 0) {
      toast(`Tiene ${count} juego(s). Reasígnalos antes de eliminar.`, 'bd');
      return;
    }
    setRemoving(row);
  };

  const confirmRemove = () => {
    if (!removing || removingBusy) return;
    setRemovingBusy(true);
    adminFetch(`${config.api}/${removing.id}`, { method: 'DELETE' })
      .then(() => {
        toast('Eliminado');
        setRemoving(null);
        reload();
      })
      .catch((error: unknown) => {
        toast(error instanceof ApiError ? error.message : 'No se pudo eliminar', 'bd');
      })
      .finally(() => setRemovingBusy(false));
  };

  const titleLower = config.title.toLowerCase();
  const emptyTitle = `Aún no hay ${titleLower}`;
  const addActionButton = (
    <button className="btn pri" type="button" onClick={() => setModal({ mode: 'create' })}>
      Agregar {config.one}
    </button>
  );

  if (needsTenant && tenants === null) {
    return (
      <>
        <PageHead title={config.title} sub={sub} />
        <Skeleton rows={5} />
      </>
    );
  }

  if (needsTenant && tenants && tenants.length === 0) {
    return (
      <>
        <PageHead title={config.title} sub={sub} />
        <EmptyBox
          title="Aún no hay negocios"
          text="Crea un negocio para operar esta taxonomía."
          action={
            <Link className="btn" href="/admin/negocios">
              Ir a negocios
            </Link>
          }
        />
      </>
    );
  }

  let content: ReactNode;
  if (error) {
    content = <ErrorBox onRetry={reload} />;
  } else if (items === null) {
    content = <Skeleton rows={5} />;
  } else if (items.length === 0) {
    content = (
      <EmptyBox
        title={emptyTitle}
        text={config.emptyText}
        action={config.editable ? addActionButton : undefined}
      />
    );
  } else {
    content = (
      <>
        <ListShell
          cols={config.editable ? 'minmax(0,2fr) 110px 110px' : 'minmax(0,2fr) 110px'}
          head={config.editable ? ['Nombre', 'Juegos', ''] : ['Nombre', 'Juegos']}
        >
          {items.map((row) => {
            const count =
              counts === undefined ? '…' : counts === null ? '—' : (counts[row.id] ?? 0);
            return (
              <div className="li" key={row.id}>
                <div className="pc">
                  <b>{row.name}</b>
                </div>
                <div data-l="Juegos">{count}</div>
                {config.editable ? (
                  <div className="ac">
                    <button
                      className="ib"
                      type="button"
                      title="Editar"
                      aria-label={`Editar ${row.name}`}
                      onClick={() => setModal({ mode: 'edit', item: row })}
                    >
                      <AdminIcon name="edit" />
                    </button>
                    <button
                      className="ib dng"
                      type="button"
                      title="Eliminar"
                      aria-label={`Eliminar ${row.name}`}
                      onClick={() => onRemove(row)}
                    >
                      <AdminIcon name="trash" />
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </ListShell>
        {meta ? <Pager meta={meta} onPage={setPage} /> : null}
      </>
    );
  }

  return (
    <>
      <PageHead title={config.title} sub={sub} actions={actions} />
      {content}
      {config.kind === 'platform' ? (
        <p className="hint" style={{ marginTop: 14 }}>
          Xbox no está soportado.
        </p>
      ) : null}
      {modal ? (
        <TaxonomyFormModal
          config={config}
          item={modal.mode === 'edit' ? modal.item : null}
          tenantId={tenantId}
          onClose={() => setModal(null)}
          onSaved={reload}
        />
      ) : null}
      {removing ? (
        <Modal
          title="Eliminar"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setRemoving(null)}>
                Cancelar
              </button>
              <button
                className="btn dng"
                type="button"
                onClick={confirmRemove}
                disabled={removingBusy}
              >
                Eliminar
              </button>
            </>
          }
        >
          <p>Se eliminará &quot;{removing.name}&quot;.</p>
        </Modal>
      ) : null}
    </>
  );
}
