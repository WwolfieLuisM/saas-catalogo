'use client';

import { useState } from 'react';
import type { FeedGame } from '@/types/feed';
import { gradientFor, markFor } from '@/lib/feed/format';
import { imgCandidates, sized } from '@/lib/feed/images';

interface ArtProps {
  game: FeedGame;
  w?: number;
  h?: number;
  className?: string;
  showTitle?: boolean;
  priority?: boolean;
}

export function Art({ game, w = 720, h = 960, className = '', showTitle = true, priority }: ArtProps) {
  const candidates = imgCandidates(game);
  const [idx, setIdx] = useState(0);
  const src = candidates[idx] ? sized(candidates[idx], w, h) : null;

  return (
    <span
      className={`art ${className}`}
      style={{
        ['--c' as string]: gradientFor(game.hue),
        ['--glow' as string]: `hsl(${game.hue} 70% 55%)`,
      }}
    >
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- candidates externos + proxy; next/image requiere remotePatterns
        <img
          referrerPolicy="no-referrer"
          src={src}
          width={w}
          height={h}
          alt=""
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setIdx((i) => i + 1)}
        />
      )}
      <span className="art-shade" aria-hidden="true" />
      <span className="mark" aria-hidden="true">
        {markFor(game.name)}
      </span>
      <span className="sheen" aria-hidden="true" />
      {!game.available && <span className="soldout">No disponible</span>}
      {game.soon && <span className="soon-tag">Próximamente</span>}
      {showTitle && <span className="ptitle">{game.name}</span>}
    </span>
  );
}
