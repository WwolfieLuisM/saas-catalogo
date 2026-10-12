'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { dt, shortId } from '@/lib/admin/format';
import type { AuditEntry } from '@/lib/admin/types';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminList } from '@/hooks/useAdminList';
import {
  Badge,
  DeniedBox,
  EmptyBox,
  ErrorBox,
  ListShell,
  PageHead,
  Pager,
  roleBadge,
  SearchRow,
  Skeleton,
} from '@/components/admin/ui';

function detailText(entry: AuditEntry): string {
  const parts: string[] = [];
  if (entry.entity) parts.push(entry.entity);
  if (entry.entityId) parts.push(shortId(entry.entityId));
  return parts.join(': ');
}

function metadataText(entry: AuditEntry): string | null {
  if (entry.metadata === null || entry.metadata === undefined) return null;
  let json: string;
  try {
    json = JSON.stringify(entry.metadata);
  } catch {
    return null;
  }
  if (!json || json === '{}') return null;
  return json.length > 100 ? `${json.slice(0, 100)}…` : json;
}

export default function AuditoriaPage() {
  const { user } = useAdminAuth();
  const isSa = user?.role === 'SUPER_ADMIN';
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const { items, meta, error, reload } = useAdminList<AuditEntry>('/admin/audit', {
    page,
    limit: 20,
    q: query || undefined,
  }, { enabled: isSa });

  if (!isSa) return <DeniedBox />;
  const sub = 'Registro global de la plataforma.';

  let content: ReactNode;
  if (error) {
    content = <ErrorBox onRetry={reload} />;
  } else if (items === null) {
    content = <Skeleton rows={5} />;
  } else if (items.length === 0) {
    content = (
      <EmptyBox
        title="Sin registros"
        text="Las acciones aparecerán aquí a medida que ocurran."
      />
    );
  } else {
    content = (
      <>
        <ListShell cols="150px 150px minmax(0,1.2fr) minmax(0,2fr)" head={['Cuándo', 'Quién', 'Acción', 'Detalle']}>
          {items.map((entry) => (
            <div className="li" key={entry.id}>
              <div data-l="Cuándo">{dt(entry.timestamp)}</div>
              <div data-l="Quién">
                <b>{entry.actorUsername ?? '—'}</b> {roleBadge(entry.actorRole)}
              </div>
              <div data-l="Acción">{entry.action}</div>
              <div data-l="Detalle">
                <div>{detailText(entry) || '—'}</div>
                {metadataText(entry) ? (
                  <div className="mono">{metadataText(entry)}</div>
                ) : null}
                {isSa && !entry.tenantId ? <Badge tone="au">Plataforma</Badge> : null}
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
      <PageHead title="Auditoría" sub={sub} />
      <SearchRow
        value={q}
        onChange={(value) => {
          setQ(value);
          setPage(1);
        }}
        placeholder="Buscar en el registro"
        label="Buscar en auditoría"
      />
      {content}
    </>
  );
}
