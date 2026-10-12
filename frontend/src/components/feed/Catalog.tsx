'use client';

import { useFeed } from '@/hooks/useFeed';
import { GameCard } from './GameCard';
import { fmt } from '@/lib/feed/format';
import { SORTS, SORT_LABELS } from '@/lib/feed/filter';

export function Catalog() {
  const {
    games,
    filtered,
    facets,
    q,
    setQ,
    cat,
    setCat,
    genre,
    setGenre,
    platform,
    setPlatform,
    maxPrice,
    setMaxPrice,
    sort,
    setSort,
    visible,
    more,
    list,
    favorites,
    status,
    showFilters,
    toggleShowFilters,
    resetFilters,
    catalogLoading,
    loadError,
    stale,
    retryLoad,
  } = useFeed();

  const hasActiveFilters = Boolean(q || cat || genre || platform || maxPrice !== null);

  return (
    <section className="wrap catalog" id="catalog" aria-label="Catálogo de juegos">
      {loadError && !filtered.length && (
        <div className="notice error" role="alert">
          No se pudo cargar el catálogo.{' '}
          <button className="linklike" type="button" onClick={retryLoad}>
            Reintentar
          </button>
        </div>
      )}
      {stale && filtered.length > 0 && !loadError && (
        <div className="notice" role="status">
          Mostrando copia local del catálogo (puede estar desactualizada).
        </div>
      )}
      {catalogLoading && !filtered.length && (
        <div className="notice" role="status">
          Cargando catálogo…
        </div>
      )}

      <div className="cat-head">
        <h2>Catálogo</h2>
        <span className="count" aria-live="polite">
          {filtered.length} {filtered.length === 1 ? 'juego' : 'juegos'}
        </span>
      </div>

      {facets.cats.length > 0 && (
        <div className="tabs" role="group" aria-label="Filtrar por categoría">
          <button className="tab" type="button" aria-pressed={cat === ''} onClick={() => setCat('')}>
            Todos
            <small>{games.length}</small>
          </button>
          {facets.cats.map((c) => (
            <button
              key={c.value}
              className="tab"
              type="button"
              aria-pressed={cat === c.value}
              onClick={() => setCat(c.value)}
            >
              {c.label}
              <small>{c.count}</small>
            </button>
          ))}
        </div>
      )}

      <div className="tools">
        <button
          className="mini"
          id="filtersBtn"
          type="button"
          aria-expanded={showFilters}
          aria-controls="moreFilters"
          onClick={toggleShowFilters}
        >
          Filtros
        </button>
        <label>
          <span className="sr">Ordenar por</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Ordenar por">
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        {hasActiveFilters && (
          <button className="linklike" type="button" onClick={resetFilters}>
            Limpiar filtros
          </button>
        )}
      </div>

      <div className={`more${showFilters ? ' open' : ''}`} id="moreFilters" role="group" aria-label="Filtros avanzados">
        <label>
          Género{' '}
          <select value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="all">Todos</option>
            {facets.genres.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label} ({g.count})
              </option>
            ))}
          </select>
        </label>
        <label>
          Plataforma{' '}
          <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
            <option value="all">Todas</option>
            {facets.platforms.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label} ({p.count})
              </option>
            ))}
          </select>
        </label>
        {facets.maxPriceAll > 0 && (
          <label className="range-label">
            Hasta{' '}
            <input
              type="range"
              min={0}
              max={facets.maxPriceAll}
              step={500}
              value={maxPrice ?? facets.maxPriceAll}
              aria-label="Precio máximo"
              onChange={(e) => {
                const v = Number(e.target.value);
                setMaxPrice(v >= facets.maxPriceAll ? null : v);
              }}
            />{' '}
            <output>{maxPrice === null ? facets.maxPriceAll : fmt(maxPrice)} CUP</output>
          </label>
        )}
        {q && (
          <button
            className="linklike"
            type="button"
            onClick={() => {
              setQ('');
              document.getElementById('q-input')?.focus();
            }}
          >
            Borrar búsqueda
          </button>
        )}
      </div>

      <div className="grid" id="catalog-grid" aria-busy={catalogLoading}>
        {filtered.slice(0, visible).map((g) => (
          <GameCard
            key={g.id}
            game={g}
            inList={list.includes(g.id)}
            isFav={favorites.includes(g.id)}
            st={status[g.id]}
          />
        ))}
        {!filtered.length && (
          <div className="empty">
            <b>{q ? 'No tenemos ese juego todavía' : 'Ningún juego coincide con los filtros'}</b>
            <p>{q ? 'Escríbenos y lo conseguimos para ti.' : 'Prueba otra categoría o ajusta los filtros.'}</p>
            <button
              className="btn"
              type="button"
              onClick={() => {
                if (loadError && !games.length) retryLoad();
                else if (q) {
                  const msg = `Hola, busco: ${q}`;
                  window.open(
                    `https://wa.me/${(process.env.NEXT_PUBLIC_WHATSAPP ?? '').replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`,
                    '_blank',
                    'noopener',
                  );
                } else resetFilters();
              }}
            >
              {q ? 'Pedir este juego' : 'Quitar filtros'}
            </button>
          </div>
        )}
      </div>

      <div className="more-wrap" hidden={filtered.length <= visible}>
        <button className="btn" type="button" onClick={more}>
          Mostrar más juegos ({filtered.length - visible} restantes)
        </button>
      </div>
    </section>
  );
}
