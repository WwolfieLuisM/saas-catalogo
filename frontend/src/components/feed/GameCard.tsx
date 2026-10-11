'use client';

import { memo } from 'react';
import type { FeedGame, GameStatus } from '@/types/feed';
import { Art } from './Art';
import { fmt, gb } from '@/lib/feed/format';
import { useFeed } from '@/hooks/useFeed';

interface GameCardProps {
  game: FeedGame;
  inList: boolean;
  isFav: boolean;
  st?: GameStatus;
}

function GameCardBase({ game: g, inList, isFav, st }: GameCardProps) {
  const { openDetail, toggleList, toggleFavorite, setStatus } = useFeed();
  const statusLabel = st === 'played' ? 'Jugado' : st === 'won' ? 'Ganado' : st === 'pending' ? 'Pendiente' : null;

  return (
    <article
      className={`card${statusLabel ? ' has-status' : ''}`}
      data-id={g.id}
      tabIndex={0}
      role="button"
      aria-label={`${g.name} — abrir detalle`}
      onClick={() => openDetail(g.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openDetail(g.id);
        }
      }}
    >
      <button
        className="poster-btn"
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={(e) => {
          e.stopPropagation();
          openDetail(g.id);
        }}
      >
        <Art game={g} w={720} h={960} />
      </button>
      <div className="info">
        {statusLabel && <span className="status-chip">{statusLabel}</span>}
        <h3>{g.name}</h3>
        <p className="sub">
          {[g.category, ...g.genres.slice(0, 2), ...g.platforms.slice(0, 2)].filter(Boolean).join(' · ')}
          {g.sizeGb ? ` · ${gb(g.sizeGb)} GB` : ''}
        </p>
        <div className="foot">
          {g.soon ? (
            <span className="price soon-price">Próximamente</span>
          ) : (
            <span className="price">
              {fmt(g.price ?? 0)}
              <small>CUP</small>
            </span>
          )}
          <div className="card-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="mini"
              type="button"
              title={isFav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
              aria-label={isFav ? `Quitar ${g.name} de favoritos` : `Añadir ${g.name} a favoritos`}
              aria-pressed={isFav}
              onClick={() => toggleFavorite(g.id)}
            >
              {isFav ? '♥' : '♡'}
            </button>
            <button
              className="mini"
              type="button"
              aria-label={`Cambiar estado de ${g.name}`}
              title="Estado"
              aria-haspopup="listbox"
              onClick={() => {
                const order: (GameStatus | undefined)[] = [undefined, 'pending', 'played', 'won'];
                const i = order.indexOf(st);
                setStatus(g.id, order[(i + 1) % order.length]);
              }}
            >
              {st === 'played' ? '✓' : st === 'won' ? '★' : st === 'pending' ? '…' : '○'}
            </button>
            <button
              className="mini"
              type="button"
              aria-label={inList ? `Quitar ${g.name} de la lista` : `Añadir ${g.name} a la lista`}
              aria-pressed={inList}
              onClick={() => toggleList(g.id)}
            >
              {inList ? '−' : '+'}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

export const GameCard = memo(GameCardBase);
