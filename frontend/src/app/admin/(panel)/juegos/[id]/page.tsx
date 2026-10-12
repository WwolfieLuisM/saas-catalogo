'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { adminFetch } from '@/lib/admin/adminApi';
import { nf } from '@/lib/admin/format';
import { fetchMediaManifest } from '@/lib/admin/mediaApi';
import { toast } from '@/lib/admin/toast';
import type { GameItem, GameRequirements, MediaManifest } from '@/lib/admin/types';
import { GameHistoryModal } from '@/components/admin/GameHistoryModal';
import {
  ArtThumb,
  Badge,
  EmptyBox,
  ErrorBox,
  NotFoundBox,
  PageHead,
  Skeleton,
} from '@/components/admin/ui';
import { AdminIcon } from '@/components/admin/icons';
import { useAdminAuth } from '@/hooks/useAdminAuth';

function priceModeLabel(priceMode: string): string {
  return priceMode === 'RULE' ? 'por reglas del negocio' : 'manual';
}

function emptyReqRows(): ReactNode {
  return (
    <tbody>
      <tr>
        <th>Procesador</th>
        <td>—</td>
      </tr>
      <tr>
        <th>Gráficos</th>
        <td>—</td>
      </tr>
      <tr>
        <th>RAM</th>
        <td>—</td>
      </tr>
      <tr>
        <th>Sistema</th>
        <td>—</td>
      </tr>
      <tr>
        <th>DirectX</th>
        <td>—</td>
      </tr>
      <tr>
        <th>Almacenamiento</th>
        <td>—</td>
      </tr>
    </tbody>
  );
}

function reqRows(r: GameRequirements, sizeValue: number | null, sizeUnit: string | null): ReactNode {
  const sizeLine =
    sizeValue !== null && sizeUnit ? `${r.storage}, ${nf(sizeValue)} ${sizeUnit} libres` : r.storage;
  return (
    <tbody>
      <tr>
        <th>Procesador</th>
        <td>{r.cpu}</td>
      </tr>
      <tr>
        <th>Gráficos</th>
        <td>{r.gpu}</td>
      </tr>
      <tr>
        <th>RAM</th>
        <td>{r.ram}</td>
      </tr>
      <tr>
        <th>Sistema</th>
        <td>{r.os}</td>
      </tr>
      <tr>
        <th>DirectX</th>
        <td>{r.directX}</td>
      </tr>
      <tr>
        <th>Almacenamiento</th>
        <td>{sizeLine}</td>
      </tr>
    </tbody>
  );
}

export default function JuegoDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAdminAuth();
  const isSa = user?.role === 'SUPER_ADMIN';
  const id = params.id;
  const [game, setGame] = useState<GameItem | null>(null);
  const [manifest, setManifest] = useState<MediaManifest | null>(null);
  const [failed, setFailed] = useState<'none' | 'missing' | 'error'>('none');
  const [tick, setTick] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setGame(null);
      setManifest(null);
      setFailed('none');
      Promise.all([
        adminFetch<GameItem>(`/admin/games/${id}`),
        fetchMediaManifest(id).catch(() => null),
      ])
        .then(([row, media]) => {
          if (cancelled) return;
          setGame(row);
          setManifest(media);
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          setFailed(cause instanceof ApiError && cause.status === 404 ? 'missing' : 'error');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  const duplicate = () => {
    if (duplicating) return;
    setDuplicating(true);
    adminFetch<GameItem>(`/admin/games/${id}/duplicate`, { method: 'POST' })
      .then((created) => {
        toast('Copia creada como juego personalizado (no disponible)');
        router.push(`/admin/juegos/${created.id}/editar`);
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo duplicar', 'bd');
      })
      .finally(() => setDuplicating(false));
  };

  if (failed === 'missing') return <NotFoundBox />;
  if (failed === 'error') return <ErrorBox onRetry={() => setTick((value) => value + 1)} />;
  if (!game) return <Skeleton rows={6} />;

  const cover = manifest?.cover ?? null;
  const shots = manifest?.screenshots ?? [];
  const genre = game.genres[0]?.name ?? '';
  const year = game.releaseYear !== null ? String(game.releaseYear) : '';
  const platformNames = game.platforms.map((platform) => platform.name).join(' + ');
  const subParts = [genre, year].filter(Boolean).join(', ');
  const sub = platformNames ? `${subParts ? `${subParts}. ` : ''}${platformNames}` : subParts;
  const hasMedia = Boolean(cover?.url) || shots.some((shot) => shot.url);

  return (
    <>
      <p className="hint">
        <Link href="/admin/juegos">Juegos</Link> / {game.title}
      </p>
      <PageHead
        title={game.title}
        sub={sub || undefined}
        actions={
          <>
            {isSa ? (
              <button className="btn" type="button" onClick={() => setHistoryOpen(true)}>
                <AdminIcon name="clock" />
                Historial
              </button>
            ) : null}
            <button className="btn" type="button" disabled={duplicating} onClick={duplicate}>
              <AdminIcon name="copy" />
              Duplicar
            </button>
            <Link className="btn pri" href={`/admin/juegos/${game.id}/editar`}>
              <AdminIcon name="edit" />
              Editar
            </Link>
          </>
        }
      />
      <div className="vh">
        <div>
          {cover?.url ? (
            <ArtThumb title={game.title} url={cover.url} />
          ) : (
            <div
              className="art none"
              style={{ aspectRatio: '3/4', borderRadius: '10px', display: 'grid', placeItems: 'center' }}
            >
              Sin portada
            </div>
          )}
        </div>
        <div>
          <dl className="kv">
            <dt>Estado</dt>
            <dd>
              {game.deletedAt ? (
                <Badge tone="bd">Eliminado</Badge>
              ) : game.availability ? (
                <Badge tone="ok">Disponible</Badge>
              ) : (
                <Badge tone="wn">No disponible</Badge>
              )}
            </dd>
            <dt>Origen</dt>
            <dd>
              {game.origin === 'BIBLIOTECA' ? (
                <Badge tone="in">Biblioteca base</Badge>
              ) : (
                <Badge tone="au">Personalizado</Badge>
              )}
            </dd>
            <dt>Categoría</dt>
            <dd>{game.category?.name ?? '—'}</dd>
            <dt>Tamaño</dt>
            <dd>{game.sizeValue !== null && game.sizeUnit ? `${nf(game.sizeValue)} ${game.sizeUnit}` : '—'}</dd>
            <dt>Precio</dt>
            <dd>
              {game.price === null ? 'Sin regla aplicable' : `${nf(game.price)} CUP`}{' '}
              <small>({priceModeLabel(game.priceMode)})</small>
            </dd>
            <dt>Descripción</dt>
            <dd>{game.description || '—'}</dd>
            <dt>ID del tenant</dt>
            <dd className="mono">{game.tenantId}</dd>
          </dl>
        </div>
      </div>
      <section className="sec">
        <h2>Requisitos</h2>
        <div className="grid2">
          <div>
            <h3 style={{ fontSize: '20px', marginBottom: '6px' }}>Mínimos</h3>
            <table className="req">
              {game.minimumRequirements
                ? reqRows(game.minimumRequirements, game.sizeValue, game.sizeUnit)
                : emptyReqRows()}
            </table>
          </div>
          <div>
            <h3 style={{ fontSize: '20px', marginBottom: '6px' }}>Recomendados</h3>
            <table className="req">
              {game.recommendedRequirements
                ? reqRows(game.recommendedRequirements, game.sizeValue, game.sizeUnit)
                : emptyReqRows()}
            </table>
          </div>
        </div>
      </section>
      <section className="sec">
        <h2>Multimedia</h2>
        {hasMedia ? (
          <div className="mg">
            {cover?.url ? (
              <div className="mi cv">
                <ArtThumb title={game.title} url={cover.url} />
                <small>Portada</small>
              </div>
            ) : null}
            {shots
              .filter((shot) => shot.url)
              .map((shot) => (
                <div className="mi" key={shot.id}>
                  <ArtThumb title={game.title} url={shot.url} />
                  <small>Screenshot</small>
                </div>
              ))}
          </div>
        ) : (
          <EmptyBox
            title="Sin multimedia"
            text="Sube una portada y hasta 4 screenshots."
            action={
              <Link className="btn" href={`/admin/juegos/${game.id}/editar`}>
                Agregar multimedia
              </Link>
            }
          />
        )}
      </section>
      {isSa && historyOpen ? (
        <GameHistoryModal
          gameId={game.id}
          title={game.title}
          onClose={() => setHistoryOpen(false)}
        />
      ) : null}
    </>
  );
}
