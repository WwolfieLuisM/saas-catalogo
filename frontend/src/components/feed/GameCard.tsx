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

function GameCardBase({ game: g, inList, st }: GameCardProps) {
  const { openDetail, toggleList, setStatus } = useFeed();
  const statusLabel = st === 'played' ? 'Jugado' : st === 'won' ? 'Ganado' : st === 'pending' ? 'Pendiente' : null;
  const sub = [g.category, g.genres[0], g.sizeGb ? `${gb(g.sizeGb)} GB` : '', g.year].filter(Boolean).join(' · ');

  return (
    <article
      className={`card${statusLabel ? ' has-status' : ''}`}
      data-id={g.id}
      tabIndex={0}
      role="button"
      aria-label={`Ver detalles de ${g.name}`}
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
        <div className="card-top"><h3>{g.name}</h3></div>
        <p className="sub">{sub}</p>
        {statusLabel && <span className="status-chip">{statusLabel}</span>}
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
            {g.soon ? (
              <button className="mini" type="button" aria-label={`Avisarme de ${g.name}`} onClick={() => setStatus(g.id, st === 'pending' ? undefined : 'pending')}>
                {st === 'pending' ? '✓' : 'Avísame'}
              </button>
            ) : (
              <button
                className="mini"
                type="button"
                aria-label={inList ? `Quitar ${g.name} de la lista` : `Añadir ${g.name} a la lista`}
                aria-pressed={inList}
                onClick={() => toggleList(g.id)}
              >
                {inList ? 'En lista' : '+ Añadir'}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export const GameCard = memo(GameCardBase);
