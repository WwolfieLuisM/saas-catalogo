'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch, adminFetchPaged } from '@/lib/admin/adminApi';
import { toast } from '@/lib/admin/toast';
import {
  deleteGameCover,
  deleteGameShot,
  uploadGameCover,
  uploadGameShot,
  validateImageFile,
} from '@/lib/admin/mediaApi';
import type { GameItem, MediaEntry } from '@/lib/admin/types';
import { useAdminList } from '@/hooks/useAdminList';
import { useTenantScope } from '@/hooks/useTenantScope';
import { AdminIcon } from '@/components/admin/icons';
import {
  ArtThumb,
  Badge,
  EmptyBox,
  ErrorBox,
  Field,
  Modal,
  PageHead,
  Pager,
  SearchRow,
  Skeleton,
  TabsButtons,
} from '@/components/admin/ui';

type MediaTab = 'all' | 'cover' | 'shot' | 'orphan';

type MediaModal =
  | { mode: 'view'; item: MediaEntry }
  | { mode: 'delete'; item: MediaEntry }
  | { mode: 'upload'; gameId: string; kind: 'COVER' | 'SHOT' }
  | null;

function statusBadge(status: MediaEntry['status']) {
  if (status === 'OK') return <Badge tone="ok">Sincronizada</Badge>;
  if (status === 'ORPHAN') return <Badge tone="wn">Huérfana</Badge>;
  if (status === 'PENDING') return <Badge tone="in">Subiendo</Badge>;
  return <Badge tone="bd">Error de subida</Badge>;
}

function UploadModal({
  games,
  onClose,
  onPick,
}: {
  games: GameItem[];
  onClose: () => void;
  onPick: (gameId: string, kind: 'COVER' | 'SHOT') => void;
}) {
  const [gameId, setGameId] = useState(games[0]?.id ?? '');
  const [kind, setKind] = useState<'COVER' | 'SHOT'>('COVER');

  return (
    <Modal
      title="Subir multimedia"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn pri"
            type="button"
            disabled={!gameId}
            onClick={() => onPick(gameId, kind)}
          >
            <AdminIcon name="upload" />
            Elegir archivo
          </button>
        </>
      }
    >
      <div className="grid2">
        <Field label="Juego">
          <select value={gameId} onChange={(event) => setGameId(event.target.value)}>
            {games.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Tipo">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value === 'SHOT' ? 'SHOT' : 'COVER')}
          >
            <option value="COVER">Portada</option>
            <option value="SHOT">Screenshot</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

export default function MediaPage() {
  const scope = useTenantScope();
  const [tab, setTab] = useState<MediaTab>('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<MediaModal>(null);
  const [busy, setBusy] = useState(false);
  const [games, setGames] = useState<GameItem[]>([]);
  const [scanBusy, setScanBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingRef = useRef<{ gameId: string; kind: 'COVER' | 'SHOT' } | null>(null);

  const listQuery = useMemo(
    () => ({
      page,
      limit: 24,
      sort: '-createdAt',
      ...(q ? { q } : {}),
      ...(tab === 'orphan' ? { status: 'ORPHAN' as const } : {}),
    }),
    [page, q, tab],
  );

  const { items, meta, error, reload } = useAdminList<MediaEntry>('/admin/media', listQuery, {
    enabled: scope.ready,
  });

  useEffect(() => {
    if (!scope.ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      adminFetchPaged<GameItem>('/admin/games', {
        query: {
          page: 1,
          limit: 100,
          sort: 'title',
          tenantId: scope.scopeId,
        },
      })
        .then((result) => {
          if (!cancelled) setGames(result.data);
        })
        .catch(() => {
          if (!cancelled) setGames([]);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [scope.ready, scope.scopeId, scope.tenantId]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (tab === 'cover') return items.filter((item) => item.kind === 'COVER');
    if (tab === 'shot') return items.filter((item) => item.kind === 'SHOT');
    return items;
  }, [items, tab]);

  const counts = useMemo(() => {
    const all = items ?? [];
    return {
      all: meta?.total ?? all.length,
      cover: all.filter((item) => item.kind === 'COVER').length,
      shot: all.filter((item) => item.kind === 'SHOT').length,
      orphan: tab === 'orphan' ? meta?.total ?? all.length : 0,
    };
  }, [items, meta, tab]);

  const scan = (mode: 'orphan' | 'sync') => {
    setScanBusy(true);
    adminFetch<{ markedOrphan: number; orphans: MediaEntry[] }>('/admin/media/scan', {
      method: 'POST',
      query: { tenantId: scope.scopeId },
    })
      .then((result) => {
        const n = result.markedOrphan ?? result.orphans?.length ?? 0;
        if (mode === 'orphan') {
          toast(
            n > 0
              ? `Escaneo completo: ${n} huérfana(s) encontrada(s).`
              : 'Escaneo completo: no hay huérfanas.',
          );
        } else {
          toast('Referencias sincronizadas con Cloudinary');
        }
        reload();
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo escanear', 'bd');
      })
      .finally(() => setScanBusy(false));
  };

  const openFile = (gameId: string, kind: 'COVER' | 'SHOT') => {
    pendingRef.current = { gameId, kind };
    if (fileRef.current) {
      fileRef.current.value = '';
      fileRef.current.click();
    }
  };

  const onFile = (file: File | undefined) => {
    const pending = pendingRef.current;
    if (!file || !pending) return;
    const invalid = validateImageFile(file);
    if (invalid) {
      toast(invalid, 'bd');
      return;
    }
    setBusy(true);
    const action =
      pending.kind === 'COVER'
        ? uploadGameCover(pending.gameId, file)
        : uploadGameShot(pending.gameId, file);
    action
      .then(() => {
        toast('Imagen sincronizada con Cloudinary');
        reload();
        setModal(null);
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo subir', 'bd');
      })
      .finally(() => {
        setBusy(false);
        pendingRef.current = null;
      });
  };

  const remove = (item: MediaEntry) => {
    setBusy(true);
    const action =
      item.kind === 'COVER'
        ? deleteGameCover(item.gameId)
        : deleteGameShot(item.gameId, item.id);
    action
      .then(() => {
        toast('Archivo eliminado');
        reload();
        setModal(null);
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo eliminar', 'bd');
      })
      .finally(() => setBusy(false));
  };

  const hasFilters = Boolean(q || tab !== 'all');
  const clearFilters = () => {
    setQ('');
    setTab('all');
    setPage(1);
  };

  let content: ReactNode;
  if (error) {
    content = <ErrorBox onRetry={reload} />;
  } else if (filtered === null) {
    content = <Skeleton rows={4} />;
  } else if (filtered.length === 0) {
    content =
      tab === 'orphan' ? (
        <div className="state">
          <AdminIcon name="check" />
          <h3>Sin huérfanas</h3>
          <p>Todas las imágenes de Cloudinary tienen un juego asociado.</p>
        </div>
      ) : (
        <EmptyBox
          title="Sin multimedia aquí"
          text="Sube portadas y screenshots desde la ficha de cada juego."
          action={
            hasFilters ? (
              <button className="btn" type="button" onClick={clearFilters}>
                Limpiar filtros
              </button>
            ) : undefined
          }
        />
      );
  } else {
    content = (
      <>
        <p className="cnt">{filtered.length} archivo(s)</p>
        <div className="mg" style={{ marginTop: '10px' }}>
          {filtered.map((item) => (
            <div className={`mi${item.kind === 'COVER' ? ' cv' : ''}`} key={item.id}>
              <ArtThumb title={item.game?.title ?? item.publicId ?? 'Sin juego'} url={item.url} />
              <div className="nm">
                <b>{item.game?.title ?? 'Sin juego asociado'}</b>
                <small>{item.kind === 'COVER' ? 'Portada' : 'Screenshot'}</small>
              </div>
              <div>{statusBadge(item.status)}</div>
              <div className="ma">
                <button
                  className="ib"
                  type="button"
                  title="Ver"
                  aria-label="Ver"
                  onClick={() => setModal({ mode: 'view', item })}
                >
                  <AdminIcon name="eye" />
                </button>
                {item.gameId ? (
                  <button
                    className="ib"
                    type="button"
                    title="Reemplazar"
                    aria-label="Reemplazar"
                    disabled={busy}
                    onClick={() => openFile(item.gameId, item.kind)}
                  >
                    <AdminIcon name="upload" />
                  </button>
                ) : null}
                {item.status === 'ERROR' ? (
                  <button
                    className="ib"
                    type="button"
                    title="Reintentar"
                    aria-label="Reintentar"
                    disabled={busy}
                    onClick={() => openFile(item.gameId, item.kind)}
                  >
                    <AdminIcon name="refresh" />
                  </button>
                ) : null}
                <button
                  className="ib dng"
                  type="button"
                  title="Eliminar"
                  aria-label="Eliminar"
                  disabled={busy}
                  onClick={() => setModal({ mode: 'delete', item })}
                >
                  <AdminIcon name="trash" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {meta ? <Pager meta={meta} onPage={setPage} /> : null}
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Multimedia"
        sub="Portadas y screenshots alojados en Cloudinary. La base de datos guarda solo referencias y metadatos."
        actions={
          <>
            <button
              className="btn"
              type="button"
              disabled={scanBusy}
              onClick={() => scan('orphan')}
            >
              <AdminIcon name="search" />
              Detectar huérfanas
            </button>
            <button
              className="btn"
              type="button"
              disabled={scanBusy}
              onClick={() => scan('sync')}
            >
              <AdminIcon name="refresh" />
              Sincronizar referencias
            </button>
            <button
              className="btn pri"
              type="button"
              onClick={() => setModal({ mode: 'upload', gameId: games[0]?.id ?? '', kind: 'COVER' })}
            >
              <AdminIcon name="upload" />
              Subir
            </button>
          </>
        }
      />
      <TabsButtons
        items={[
          { key: 'all', label: 'Todas', count: counts.all },
          { key: 'cover', label: 'Portadas', count: counts.cover },
          { key: 'shot', label: 'Screenshots', count: counts.shot },
          { key: 'orphan', label: 'Huérfanas', count: counts.orphan },
        ]}
        active={tab}
        onSelect={(key) => {
          setTab(key as MediaTab);
          setPage(1);
        }}
      />
      <SearchRow
        value={q}
        onChange={(value) => {
          setQ(value);
          setPage(1);
        }}
        placeholder="Buscar por juego o ID de Cloudinary"
        label="Buscar multimedia"
      />
      {content}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={(event) => onFile(event.target.files?.[0])}
      />
      {modal?.mode === 'upload' ? (
        <UploadModal
          games={games}
          onClose={() => setModal(null)}
          onPick={(gameId, kind) => {
            setModal({ mode: 'upload', gameId, kind });
            openFile(gameId, kind);
          }}
        />
      ) : null}
      {modal?.mode === 'view' ? (
        <Modal
          title={modal.item.game?.title ?? 'Sin juego asociado'}
          onClose={() => setModal(null)}
          wide
          footer={
            <button className="btn" type="button" onClick={() => setModal(null)}>
              Cerrar
            </button>
          }
        >
          <div className="lg">
            <ArtThumb
              title={modal.item.game?.title ?? 'Sin juego'}
              url={modal.item.url}
              className="full"
            />
          </div>
          <p className="mono" style={{ marginTop: '10px' }}>
            {modal.item.publicId ?? '—'}
          </p>
        </Modal>
      ) : null}
      {modal?.mode === 'delete' ? (
        <Modal
          title="Eliminar archivo"
          onClose={() => setModal(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setModal(null)} disabled={busy}>
                Cancelar
              </button>
              <button
                className="btn dng"
                type="button"
                disabled={busy}
                onClick={() => remove(modal.item)}
              >
                Eliminar
              </button>
            </>
          }
        >
          <p>Se quitará la referencia y se pedirá al servidor borrar la imagen en Cloudinary.</p>
        </Modal>
      ) : null}
    </>
  );
}
