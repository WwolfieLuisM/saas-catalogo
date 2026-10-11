'use client';

import { useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch } from '@/lib/admin/adminApi';
import { rel } from '@/lib/admin/format';
import { toast } from '@/lib/admin/toast';
import type { SessionEntry } from '@/lib/admin/types';
import { useAdminList } from '@/hooks/useAdminList';
import {
  Badge,
  EmptyBox,
  ErrorBox,
  ListShell,
  Modal,
  PageHead,
  Pager,
  Skeleton,
} from '@/components/admin/ui';

export default function SesionesPage() {
  const [page, setPage] = useState(1);
  const [killing, setKilling] = useState<SessionEntry | null>(null);
  const [killingBusy, setKillingBusy] = useState(false);

  const { items, meta, error: listError, reload } = useAdminList<SessionEntry>(
    '/admin/sessions',
    {
      page,
      limit: 20,
      status: 'active',
    },
  );

  const confirmKill = () => {
    if (!killing || killingBusy) return;
    setKillingBusy(true);
    adminFetch(`/admin/sessions/${killing.id}`, { method: 'DELETE' })
      .then(() => {
        toast('Sesión cerrada');
        setKilling(null);
        reload();
      })
      .catch((err: unknown) => {
        toast(err instanceof ApiError ? err.message : 'No se pudo cerrar la sesión', 'bd');
        setKilling(null);
        reload();
      })
      .finally(() => setKillingBusy(false));
  };

  let content: ReactNode;
  if (listError) {
    content = <ErrorBox onRetry={reload} />;
  } else if (items === null) {
    content = <Skeleton rows={5} />;
  } else if (items.length === 0) {
    content = (
      <EmptyBox
        title="Sin sesiones activas"
        text="Cuando alguien inicie sesión aparecerá aquí."
      />
    );
  } else {
    content = (
      <>
        <ListShell
          cols="minmax(0,1.6fr) 130px 130px 130px 130px"
          head={['Dispositivo', 'Usuario', 'Inicio', 'Última actividad', '']}
        >
          {items.map((session) => (
            <div className="li" key={session.id}>
              <div className="pc">
                <b>{session.userAgent ?? 'Dispositivo desconocido'}</b>
              </div>
              <div data-l="Usuario">{session.adminUsername ?? '—'}</div>
              <div data-l="Inicio">{rel(session.createdAt)}</div>
              <div data-l="Última actividad">{rel(session.lastUsedAt)}</div>
              <div className="ac">
                {session.isCurrent ? (
                  <Badge tone="ok">Esta sesión</Badge>
                ) : (
                  <button
                    className="btn sm dng"
                    type="button"
                    onClick={() => setKilling(session)}
                  >
                    Cerrar sesión
                  </button>
                )}
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
        title="Sesiones"
        sub="Dispositivos con sesión iniciada. Cerrar una sesión la invalida en el servidor."
      />
      {content}
      {killing ? (
        <Modal
          title="Cerrar sesión"
          onClose={() => setKilling(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setKilling(null)}>
                Cancelar
              </button>
              <button
                className="btn dng"
                type="button"
                onClick={confirmKill}
                disabled={killingBusy}
              >
                Cerrar sesión
              </button>
            </>
          }
        >
          <p>La sesión se invalidará en el servidor.</p>
        </Modal>
      ) : null}
    </>
  );
}
