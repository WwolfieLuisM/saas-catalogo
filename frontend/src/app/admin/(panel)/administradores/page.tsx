'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch } from '@/lib/admin/adminApi';
import { rel, shortId } from '@/lib/admin/format';
import { toast } from '@/lib/admin/toast';
import type { AdminEntry, AdminRole, TenantEntry } from '@/lib/admin/types';
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
  roleBadge,
  Skeleton,
} from '@/components/admin/ui';

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,50}$/;

function InviteModal({
  tenants,
  onClose,
  onSaved,
}: {
  tenants: TenantEntry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<AdminRole>('ADMIN');
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  const submit = () => {
    const cleanUser = username.trim();
    if (!USERNAME_RE.test(cleanUser)) {
      toast('Usuario inválido: 3 a 50 caracteres (letras, números, punto, guion o guion bajo).', 'bd');
      return;
    }
    if (password.length < 8 || password.length > 128) {
      toast('La contraseña debe tener 8 a 128 caracteres.', 'bd');
      return;
    }
    if (role === 'ADMIN' && !tenantId) {
      toast('Selecciona un negocio para el rol ADMIN.', 'bd');
      return;
    }
    setBusy(true);
    adminFetch('/admin/administrators', {
      method: 'POST',
      body: {
        username: cleanUser,
        password,
        role,
        ...(role === 'ADMIN' ? { tenantId } : {}),
      },
    })
      .then(() => {
        toast('Administrador creado');
        onSaved();
        onClose();
      })
      .catch((error: unknown) => {
        toast(error instanceof ApiError ? error.message : 'No se pudo crear', 'bd');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title="Invitar administrador"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn pri" type="button" onClick={submit} disabled={busy}>
            Crear administrador
          </button>
        </>
      }
    >
      <div className="grid2">
        <Field label="Usuario">
          <input
            value={username}
            maxLength={50}
            autoComplete="off"
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>
        <Field label="Contraseña">
          <input
            type="password"
            value={password}
            maxLength={128}
            autoComplete="new-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field label="Rol">
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as AdminRole)}
          >
            <option value="ADMIN">ADMIN</option>
            <option value="SUPER_ADMIN">SUPER_ADMIN</option>
          </select>
        </Field>
        {role === 'ADMIN' ? (
          <Field label="Negocio">
            <select value={tenantId} onChange={(event) => setTenantId(event.target.value)}>
              {tenants.map((tenant) => (
                <option key={tenant.id} value={tenant.id}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        El negocio es obligatorio para el rol ADMIN.
      </p>
    </Modal>
  );
}

function AdministradoresList() {
  const { user } = useAdminAuth();
  const [tenants, setTenants] = useState<TenantEntry[] | null>(null);
  const [page, setPage] = useState(1);
  const [inviting, setInviting] = useState(false);

  useEffect(() => {
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
  }, []);

  const { items, meta, error, reload } = useAdminList<AdminEntry>(
    '/admin/administrators',
    { page, limit: 20 },
  );

  const tenantName = (tenantId: string | null): string => {
    if (!tenantId) return 'Plataforma';
    return tenants?.find((tenant) => tenant.id === tenantId)?.name ?? tenantId;
  };

  const toggle = (entry: AdminEntry) => {
    adminFetch(`/admin/administrators/${entry.id}`, {
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

  const inviteButton = (
    <button className="btn pri" type="button" onClick={() => setInviting(true)}>
      <AdminIcon name="plus" />
      Invitar administrador
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
        title="Aún no hay administradores"
        text="Invita a alguien con acceso."
        action={
          <button className="btn" type="button" onClick={() => setInviting(true)}>
            Invitar administrador
          </button>
        }
      />
    );
  } else {
    content = (
      <>
        <ListShell
          cols="minmax(0,1.6fr) 130px 130px 110px 130px 120px"
          head={['Nombre', 'Rol', 'Negocio', 'Estado', 'Último acceso', '']}
        >
          {items.map((entry) => {
            const hideToggle = entry.role === 'SUPER_ADMIN' || entry.username === user?.username;
            return (
              <div className="li" key={entry.id}>
                <div className="pc">
                  <Avatar label={entry.username} />
                  <div className="nm">
                    <b>{entry.username}</b>
                    <small className="mono">{shortId(entry.id)}</small>
                  </div>
                </div>
                <div data-l="Rol">{roleBadge(entry.role)}</div>
                <div data-l="Negocio">{tenantName(entry.tenantId)}</div>
                <div data-l="Estado">
                  <Badge tone={entry.isActive ? 'ok' : 'wn'}>
                    {entry.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                <div data-l="Último acceso">
                  {entry.lastLoginAt ? rel(entry.lastLoginAt) : '—'}
                </div>
                <div className="ac">
                  {hideToggle ? null : (
                    <button className="btn sm" type="button" onClick={() => toggle(entry)}>
                      {entry.isActive ? 'Suspender' : 'Reactivar'}
                    </button>
                  )}
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
    <>
      <PageHead
        title="Administradores"
        sub="Todas las cuentas de la plataforma."
        actions={inviteButton}
      />
      {content}
      <p className="hint" style={{ marginTop: 14 }}>
        Los administradores del negocio nunca ven cuentas de otros negocios. El backend aplica ese
        aislamiento.
      </p>
      {inviting && tenants ? (
        <InviteModal
          tenants={tenants}
          onClose={() => setInviting(false)}
          onSaved={reload}
        />
      ) : null}
    </>
  );
}

export default function AdministradoresPage() {
  const { user } = useAdminAuth();
  if (user?.role !== 'SUPER_ADMIN') return <DeniedBox />;
  return <AdministradoresList />;
}
