'use client';

import { useEffect, useState } from 'react';
import { adminFetchPaged } from '@/lib/admin/adminApi';
import { rel } from '@/lib/admin/format';
import type { AuditEntry } from '@/lib/admin/types';
import { ErrorBox, Modal, Skeleton } from './ui';

function metadataDetail(entry: AuditEntry): string | null {
  if (entry.metadata === null || entry.metadata === undefined) return null;
  let json: string;
  try {
    json = JSON.stringify(entry.metadata);
  } catch {
    return null;
  }
  if (!json || json === '{}') return null;
  return json;
}

export function GameHistoryModal({
  gameId,
  title,
  onClose,
}: {
  gameId: string;
  title: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setEntries(null);
      setFailed(false);
      adminFetchPaged<AuditEntry>('/admin/audit', {
        query: { q: gameId, entity: 'TenantGame', page: 1, limit: 50 },
      })
        .then((result) => {
          if (!cancelled) setEntries(result.data);
        })
        .catch(() => {
          if (cancelled) return;
          setEntries(null);
          setFailed(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, tick]);

  return (
    <Modal
      title={`Historial: ${title}`}
      onClose={onClose}
      footer={
        <button className="btn" type="button" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      {failed ? (
        <ErrorBox onRetry={() => setTick((value) => value + 1)} />
      ) : entries === null ? (
        <Skeleton rows={3} />
      ) : entries.length === 0 ? (
        <p className="hint">Aún no hay cambios registrados para este juego.</p>
      ) : (
        <div className="rows">
          {entries.map((entry) => {
            const detail = metadataDetail(entry);
            return (
              <div key={entry.id}>
                <div className="gr">
                  <b>{entry.action}</b>
                  {detail ? (
                    <>
                      <br />
                      <small className="mono">{detail}</small>
                    </>
                  ) : null}
                </div>
                <small>
                  {entry.actorUsername ?? '—'}, {rel(entry.timestamp)}
                </small>
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
