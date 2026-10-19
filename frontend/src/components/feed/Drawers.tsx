'use client';

import { useEffect, useRef } from 'react';
import { useFeed } from '@/hooks/useFeed';
import { Art } from './Art';
import { fmt, gb } from '@/lib/feed/format';
import { deliver, listMessage, whatsappTarget } from '@/lib/feed/deliver';

function useDrawerDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
      document.body.style.overflow = 'hidden';
    } else if (!open && dlg.open) {
      dlg.close();
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return {
    ref,
    close: () => {
      onClose();
      ref.current?.close();
      document.body.style.overflow = '';
    },
    onBackdrop: (e: React.MouseEvent) => {
      if (e.target === ref.current) {
        onClose();
        ref.current?.close();
        document.body.style.overflow = '';
      }
    },
    onKey: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        ref.current?.close();
        document.body.style.overflow = '';
      }
    },
  };
}

export function CartDrawer() {
  const {
    dialog,
    closeDialog,
    games,
    list,
    toggleList,
    openDetail,
    toast,
    clearList,
    settings,
  } = useFeed();
  const { ref, close, onBackdrop, onKey } = useDrawerDialog(dialog === 'cart', closeDialog);

  const items = list.map((id) => games.find((g) => g.id === id)).filter(Boolean);
  const total = items.reduce((s, g) => s + (g?.soon ? 0 : g?.price ?? 0), 0);

  const send = async () => {
    const gs = items.filter(Boolean) as NonNullable<(typeof items)[number]>[];
    if (!gs.length) return;
    const mode = await deliver(listMessage(gs), whatsappTarget(settings));
    if (mode === 'clipboard' || mode === 'fallback') toast('Mensaje copiado. Pégalo en tu chat con Javier.');
    else if (mode === 'none') toast('No se pudo copiar el mensaje.');
  };

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label="Mi lista"
      onClick={onBackdrop}
      onKeyDown={onKey}
      onClose={close}
    >
      <div className="drawer-in">
        <div className="drawer-head">
          <h2>Mi lista</h2>
          <button className="close" type="button" aria-label="Cerrar lista" onClick={close}>
            ×
          </button>
        </div>
        {items.length === 0 ? (
          <div className="drawer-empty">
            Tu lista está vacía.
            <br />
            Añade juegos desde el catálogo.
          </div>
        ) : (
          <ul className="drawer-list">
            {items.map((g) =>
              g ? (
                <li key={g.id} className="item">
                  <button
                    className="poster-btn"
                    type="button"
                    aria-label={`Abrir ${g.name}`}
                    onClick={() => {
                      close();
                      openDetail(g.id);
                    }}
                    style={{ width: 46, minWidth: 46, maxWidth: 46, height: 62, borderRadius: 9, overflow: 'hidden' }}
                  >
                    <Art game={g} w={138} h={186} showTitle={false} />
                  </button>
                  <div className="meta">
                    <b>{g.name}</b>
                    <span>
                      {g.soon ? 'Próximamente' : `${fmt(g.price ?? 0)} CUP`}
                      {g.sizeGb ? ` · ${gb(g.sizeGb)} GB` : ''}
                    </span>
                  </div>
                  <button className="rm" type="button" onClick={() => toggleList(g.id)}>
                    Quitar
                  </button>
                </li>
              ) : null,
            )}
          </ul>
        )}
        <div className="drawer-foot">
          <div className="totals">
            <span>
              {items.length} {items.length === 1 ? 'juego' : 'juegos'}
            </span>
            <b>{fmt(total)} CUP</b>
          </div>
          <button className="btn gold" type="button" disabled={!items.length} onClick={() => void send()}>
            Pedir por mensaje
          </button>
          <button className="btn ghost" type="button" onClick={close}>
            Seguir explorando
          </button>
          {items.length > 0 && (
            <button className="linklike" type="button" onClick={clearList}>
              Vaciar lista
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

export function FavoritesDrawer() {
  const { dialog, closeDialog, games, favorites, toggleFavorite, openDetail, list, toggleList } =
    useFeed();
  const { ref, close, onBackdrop, onKey } = useDrawerDialog(dialog === 'favorites', closeDialog);

  const items = favorites.map((id) => games.find((g) => g.id === id)).filter(Boolean);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label="Favoritos"
      onClick={onBackdrop}
      onKeyDown={onKey}
      onClose={close}
    >
      <div className="drawer-in">
        <div className="drawer-head">
          <h2>Favoritos</h2>
          <button className="close" type="button" aria-label="Cerrar favoritos" onClick={close}>
            ×
          </button>
        </div>
        {items.length === 0 ? (
          <div className="drawer-empty">Aún no tienes favoritos.</div>
        ) : (
          <ul className="drawer-list">
            {items.map((g) =>
              g ? (
                <li key={g.id} className="item">
                  <button
                    className="poster-btn"
                    type="button"
                    aria-label={`Abrir ${g.name}`}
                    onClick={() => {
                      close();
                      openDetail(g.id);
                    }}
                    style={{ width: 46, minWidth: 46, maxWidth: 46, height: 62, borderRadius: 9, overflow: 'hidden' }}
                  >
                    <Art game={g} w={138} h={186} showTitle={false} />
                  </button>
                  <div className="meta">
                    <b>{g.name}</b>
                    <span>{g.soon ? 'Próximamente' : `${fmt(g.price ?? 0)} CUP`}</span>
                  </div>
                  <div style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                    <button
                      className="mini"
                      type="button"
                      aria-pressed={list.includes(g.id)}
                      onClick={() => toggleList(g.id)}
                    >
                      {list.includes(g.id) ? 'En lista' : '+ Lista'}
                    </button>
                    <button className="rm" type="button" onClick={() => toggleFavorite(g.id)}>
                      Quitar ♥
                    </button>
                  </div>
                </li>
              ) : null,
            )}
          </ul>
        )}
        <div className="drawer-foot">
          <button className="btn ghost" type="button" onClick={close}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}

type CollTab = 'all' | 'favorites' | 'pending' | 'played' | 'won';

export function CollectionDrawer() {
  const {
    dialog,
    closeDialog,
    games,
    favorites,
    status,
    openDetail,
    collectionFilter,
    setCollectionFilter,
  } = useFeed();
  const { ref, close, onBackdrop, onKey } = useDrawerDialog(dialog === 'collection', closeDialog);

  const all = games.filter((g) => status[g.id] !== undefined);
  const counts: Record<CollTab, number> = {
    all: all.length,
    favorites: favorites.length,
    pending: all.filter((g) => status[g.id] === 'pending').length,
    played: all.filter((g) => status[g.id] === 'played').length,
    won: all.filter((g) => status[g.id] === 'won').length,
  };

  const filtered =
    collectionFilter === 'all'
      ? all
      : collectionFilter === 'favorites'
        ? favorites.map((id) => games.find((g) => g.id === id)).filter(Boolean)
        : all.filter((g) => status[g.id] === collectionFilter);

  const tabs: { id: CollTab; label: string }[] = [
    { id: 'all', label: 'Todos' },
    { id: 'favorites', label: 'Favoritos' },
    { id: 'pending', label: 'Pendiente' },
    { id: 'played', label: 'Jugado' },
    { id: 'won', label: 'Ganado' },
  ];

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label="Mi colección"
      onClick={onBackdrop}
      onKeyDown={onKey}
      onClose={close}
    >
      <div className="drawer-in">
        <div className="drawer-head">
          <h2>Mi colección</h2>
          <span className="collection-count">Tu biblioteca personal</span>
          <button className="close" type="button" aria-label="Cerrar colección" onClick={close}>
            ×
          </button>
        </div>
        <div className="collection-tabs" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              className="collection-tab"
              type="button"
              aria-pressed={collectionFilter === t.id}
              onClick={() => setCollectionFilter(t.id)}
            >
              {t.label}
              <span>{counts[t.id]}</span>
            </button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="collection-empty">
            <b>{tabs.find((t) => t.id === collectionFilter)?.label ?? 'Todos'}</b>
            Marca juegos como favoritos, pendientes, jugados o ganados desde su detalle.
          </div>
        ) : (
          <ul className="collection-list">
            {filtered.map((g) =>
              g ? (
                <li key={g.id} className="item">
                  <button
                    className="poster-btn"
                    type="button"
                    aria-label={`Abrir ${g.name}`}
                    onClick={() => {
                      close();
                      openDetail(g.id);
                    }}
                  >
                    <Art game={g} w={138} h={186} showTitle={false} />
                  </button>
                  <div className="meta">
                    <b>{g.name}</b>
                    <span>
                      {favorites.includes(g.id) && status[g.id] ? 'Favorito · ' : ''}
                      {favorites.includes(g.id) && !status[g.id] ? 'Favorito' : ''}
                      {status[g.id] === 'played'
                        ? 'Jugado'
                        : status[g.id] === 'won'
                          ? 'Ganado'
                          : status[g.id] === 'pending'
                            ? 'Pendiente'
                            : g.soon
                              ? 'Próximamente'
                              : ''}
                    </span>
                    <span>
                      {g.sizeGb ? `${gb(g.sizeGb)} GB` : '-'} · {fmt(g.price ?? 0)} CUP
                    </span>
                  </div>
                </li>
              ) : null,
            )}
          </ul>
        )}
        <div className="drawer-foot">
          <button className="btn" type="button" onClick={close}>
            Seguir explorando
          </button>
        </div>
      </div>
    </dialog>
  );
}
