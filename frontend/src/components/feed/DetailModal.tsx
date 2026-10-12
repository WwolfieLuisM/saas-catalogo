'use client';

import { useEffect, useRef } from 'react';
import { useFeed } from '@/hooks/useFeed';
import { Art } from './Art';
import { fmt, gb, formatReleaseInfo, formatRequirements } from '@/lib/feed/format';
import { sized } from '@/lib/feed/images';

export function DetailModal() {
  const { detailId, games, closeDetail, toggleList, toggleFavorite, list, favorites, status, setStatus, toast } =
    useFeed();
  const ref = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const g = detailId ? games.find((x) => x.id === detailId) : undefined;

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (g && !dlg.open) {
      dlg.showModal();
      document.body.style.overflow = 'hidden';
    } else if (!g && dlg.open) {
      dlg.close();
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [g]);

  const close = () => {
    closeDetail();
    ref.current?.close();
    document.body.style.overflow = '';
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  const onBackdrop = (e: React.MouseEvent) => {
    if (e.target === ref.current) close();
  };

  if (!g) return <dialog ref={ref} className="detail-dialog" onClose={close} />;

  const inList = list.includes(g.id);
  const isFav = favorites.includes(g.id);
  const st = status[g.id];
  const ri = g.soon ? formatReleaseInfo(g.releaseDate, g.soon) : null;
  const shots = (g.screenshots ?? []).slice(0, 4);

  const menuItems = [
    {
      label: st === 'pending' ? '✓ Pendiente' : 'Marcar pendiente',
      pressed: st === 'pending',
      onClick: () => {
        setStatus(g.id, st === 'pending' ? undefined : 'pending');
        toast(st === 'pending' ? 'Estado quitado' : 'Marcado como pendiente');
      },
    },
    {
      label: st === 'played' ? '✓ Jugado' : 'Marcar jugado',
      pressed: st === 'played',
      onClick: () => {
        setStatus(g.id, st === 'played' ? undefined : 'played');
        toast(st === 'played' ? 'Estado quitado' : 'Marcado como jugado');
      },
    },
    {
      label: st === 'won' ? '★ Ganado' : 'Marcar ganado',
      pressed: st === 'won',
      onClick: () => {
        setStatus(g.id, st === 'won' ? undefined : 'won');
        toast(st === 'won' ? 'Estado quitado' : 'Marcado como ganado');
      },
    },
    { sep: true },
    {
      label: isFav ? '♥ Quitar de favoritos' : '♡ Añadir a favoritos',
      pressed: isFav,
      onClick: () => toggleFavorite(g.id),
    },
  ] as const;

  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      aria-label={g.name}
      onClick={onBackdrop}
      onKeyDown={onKey}
      onClose={close}
    >
      <div className="detail">
        <div className="detail-top">
          <button className="detail-back" type="button" aria-label="Cerrar detalle" onClick={close}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="detail-menu-wrap" ref={menuRef}>
            <button
              ref={menuBtnRef}
              className="detail-menu-btn"
              type="button"
              aria-label="Acciones del juego"
              aria-haspopup="menu"
              aria-expanded={false}
              onClick={() => {
                const m = menuRef.current?.querySelector('.detail-menu');
                if (!m) return;
                const open = m.hasAttribute('hidden');
                if (open) m.removeAttribute('hidden');
                else m.setAttribute('hidden', '');
                menuBtnRef.current?.setAttribute('aria-expanded', String(open));
              }}
            >
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
            <div className="detail-menu" role="menu" hidden>
              <span className="dm-label">Estado</span>
              {menuItems.map((it, i) =>
                'sep' in it ? (
                  <span key={i} className="dm-sep" />
                ) : (
                  <button
                    key={i}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={it.pressed}
                    onClick={() => {
                      it.onClick();
                      menuRef.current?.querySelector('.detail-menu')?.setAttribute('hidden', '');
                      menuBtnRef.current?.setAttribute('aria-expanded', 'false');
                    }}
                  >
                    {it.label}
                  </button>
                ),
              )}
            </div>
          </div>
        </div>

        <div className="detail-art">
          <Art game={g} w={1080} h={1440} showTitle={false} priority />
        </div>

        <div className="detail-body">
          <h2>{g.name}</h2>
          <p className="sub">
            {[g.category, ...g.genres, ...g.platforms].filter(Boolean).join(' · ')}
            {g.year ? ` · ${g.year}` : ''}
          </p>
          {g.description && <p className="desc">{g.description}</p>}

          <div className="specs" aria-label="Especificaciones">
            <div>
              <span>Tamaño</span>
              <b>{g.sizeGb ? `${gb(g.sizeGb)} GB` : '—'}</b>
            </div>
            <div>
              <span>Géneros</span>
              <b>{g.genres.join(', ') || '—'}</b>
            </div>
            <div>
              <span>Plataformas</span>
              <b>{g.platforms.join(', ') || 'PC'}</b>
            </div>
          </div>

          {(g.minRequirements || g.recommendedRequirements || g.requirements) && (
            <div className="requirements">
              <div className="req-head">Requisitos</div>
              <div className="req-grid">
                <div className="req">
                  <h4>Mínimos</h4>
                  <p>
                    {formatRequirements(g.minRequirements ?? g.requirements) || 'Consultar con el vendedor.'}
                  </p>
                </div>
                <div className="req">
                  <h4>Recomendados</h4>
                  <p>
                    {formatRequirements(g.recommendedRequirements) ||
                      formatRequirements(g.minRequirements ?? g.requirements) ||
                      'Consultar con el vendedor.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="detail-buy">
            {g.soon ? (
              <span className="big soon-big">
                {ri && ri.date ? `Sale el ${ri.date}` : 'Próximamente'}
              </span>
            ) : (
              <>
                <span className="big">
                  {fmt(g.price ?? 0)}
                  <small>CUP</small>
                </span>
                {g.available && <span className="available-label">Disponible</span>}
              </>
            )}
            <div className="detail-actions">
              <button
                className="btn gold"
                type="button"
                aria-pressed={inList}
                disabled={!g.available && !g.soon}
                onClick={() => toggleList(g.id)}
              >
                {g.soon ? 'Avísame' : inList ? 'En lista' : '+ Añadir a lista'}
              </button>
              <button
                className={`btn favorite-detail${isFav ? ' is-favorite' : ''}`}
                type="button"
                aria-pressed={isFav}
                onClick={() => toggleFavorite(g.id)}
              >
                {isFav ? 'En favoritos' : '♡ Favorito'}
              </button>
            </div>
          </div>

          {shots.length > 0 && (
            <div className="shots" aria-label="Capturas">
              {shots.map((s, i) => (
                <a
                  key={i}
                  className="shot"
                  href={typeof s === 'string' ? s : (s as { url?: string }).url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- capturas externas */}
                  <img
                    src={sized(typeof s === 'string' ? s : (s as { url?: string }).url ?? '', 640, 360)}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
