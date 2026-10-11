'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch, adminFetchPaged } from '@/lib/admin/adminApi';
import { slugify } from '@/lib/admin/format';
import { toast } from '@/lib/admin/toast';
import type { TenantEntry } from '@/lib/admin/types';
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

function NegociosList() {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
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
          cols="minmax(0,1.6fr) 140px 90px 110px 120px 120px"
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
    </>
  );
}

export default function NegociosPage() {
  const { user } = useAdminAuth();
  if (user?.role !== 'SUPER_ADMIN') return <DeniedBox />;
  return <NegociosList />;
}
