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

  return (
    <section className="wrap catalog" id="catalog" aria-label="Catálogo de juegos">
      {loadError && !filtered.length && (
        <div className="notice error" role="alert">
          No se pudo cargar el catálogo.{' '}
          <button className="linklike" type="button" onClick={() => window.location.reload()}>
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
        <button className="mini" type="button" aria-pressed={showFilters} onClick={toggleShowFilters}>
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
        {(q || cat !== 'all' || genre !== 'all' || platform !== 'all' || maxPrice !== null) && (
          <button className="linklike" type="button" onClick={resetFilters}>
            Limpiar filtros
          </button>
        )}
      </div>

      {showFilters && (
        <div className="more open" role="group" aria-label="Filtros avanzados">
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
              Hasta <output>{maxPrice === null ? facets.maxPriceAll : fmt(maxPrice)} CUP</output>
              <input
                type="range"
                min={0}
                max={facets.maxPriceAll}
                step={500}
                value={maxPrice ?? facets.maxPriceAll}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMaxPrice(v >= facets.maxPriceAll ? null : v);
                }}
              />
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
      )}

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
            <b>{loadError && !filtered.length ? 'No se pudo cargar el catálogo.' : 'No hay juegos que coincidan.'}</b>
            <p>
              {loadError && !filtered.length
                ? 'Revisa tu conexión y recarga la página.'
                : 'Prueba con otra búsqueda o ajusta los filtros.'}
            </p>
            <button
              className="btn"
              type="button"
              onClick={() => (loadError && !games.length ? retryLoad() : resetFilters())}
            >
              {loadError && !games.length ? 'Reintentar' : 'Limpiar filtros'}
            </button>
          </div>
        )}
      </div>

      <div className="more-wrap" hidden={filtered.length <= visible}>
        <button className="mini" type="button" onClick={more}>
          Cargar más ({filtered.length - visible} restantes)
        </button>
      </div>
    </section>
  );
}
