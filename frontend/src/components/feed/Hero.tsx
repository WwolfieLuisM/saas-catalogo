'use client';

import { useFeed } from '@/hooks/useFeed';
import { Art } from './Art';
import { formatReleaseInfo, fmt, gb } from '@/lib/feed/format';

export function Hero() {
  const { games, heroId, setHero, openDetail, toggleList, list } = useFeed();

  const ok = games.filter((g) => g.available);
  const featured = [...ok.filter((g) => g.soon), ...ok.filter((g) => !g.soon)].slice(0, 6);
  const hs = featured.length ? featured : games.slice(0, 6);
  if (!hs.length) return null;

  const currentId = heroId && hs.some((g) => g.id === heroId) ? heroId : hs[0].id;
  const g = games.find((x) => x.id === currentId) ?? hs[0];
  const inList = list.includes(g.id);
  const ri = g.soon ? formatReleaseInfo(g.releaseDate, g.soon) : null;

  return (
    <div className="wrap hero-wrap">
      <section
        className={`hero${g.soon ? ' soon' : ''}`}
        aria-label="Juego destacado"
        style={{ ['--glow-h' as string]: g.hue, ['--glow' as string]: `hsl(${g.hue} 70% 55%)` }}
      >
        <div className="hero-main">
          <div>
            {g.soon && <p className="hero-flag">Próximamente</p>}
            <p className="hero-meta">
              {[g.category, ...g.genres].filter(Boolean).join(' · ')} · {g.year ?? 'PC'}
            </p>
            <h2 className="hero-title">{g.name}</h2>
            <p className="hero-desc">
              {g.description ||
                'Consulta disponibilidad, precio y detalles de este juego en el catálogo.'}
            </p>
            <div className="hero-buy">
              {g.soon ? (
                <>
                  <span className="hero-soon">
                    {ri && ri.days !== null && ri.days > 0 ? (
                      <>
                        <b>{ri.days}</b> {ri.days === 1 ? 'día' : 'días'}
                      </>
                    ) : (
                      'Muy pronto'
                    )}
                  </span>
                  <span className="hero-disk">
                    {ri?.date ? `Sale el ${ri.date}` : 'Fecha por confirmar'}
                  </span>
                </>
              ) : (
                <>
                  <span className="hero-price">
                    {fmt(g.price ?? 0)}
                    <small>CUP</small>
                  </span>
                  <span className="hero-disk">
                    {g.sizeGb ? `${gb(g.sizeGb)} GB en disco` : 'Tamaño no indicado'}
                  </span>
                </>
              )}
            </div>
            <div className="hero-actions">
              <button
                className="btn gold"
                type="button"
                aria-pressed={inList}
                disabled={!g.available && !g.soon}
                onClick={() => toggleList(g.id)}
              >
                {g.soon ? 'Avísame' : inList ? 'En lista' : '+ Añadir'}
              </button>
              <button className="btn ghost" type="button" onClick={() => openDetail(g.id)}>
                Ver detalles
              </button>
            </div>
          </div>
          <div className="hero-art">
            <Art game={g} w={720} h={960} priority showTitle={false} />
          </div>
        </div>
        <div className="thumbs" role="group" aria-label="Más destacados">
          {hs.map((h) => (
            <button
              key={h.id}
              className="thumb"
              type="button"
              aria-pressed={h.id === g.id}
              onClick={() => setHero(h.id)}
            >
              <Art game={h} w={220} h={293} showTitle={false} />
              <span className="t">{h.name}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
