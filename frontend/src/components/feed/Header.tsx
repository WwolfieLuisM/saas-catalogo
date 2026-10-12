'use client';

import { useEffect, useRef } from 'react';
import { useFeed } from '@/hooks/useFeed';

export function Header() {
  const {
    q,
    setQ,
    list,
    favorites,
    games,
    status,
    openDialog,
    scrolledDown,
    setSidebarOpen,
    sidebarOpen,
  } = useFeed();
  const brandRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  const listCount = list.length;
  const favCount = favorites.length;
  const collCount = games.filter((g) => favorites.includes(g.id) || status[g.id]).length;

  useEffect(() => {
    const measure = () => {
      const word = brandRef.current?.querySelector('.brand-word') as HTMLElement | null;
      if (word && headerRef.current) {
        headerRef.current.style.setProperty('--brand-w', `${Math.ceil(word.offsetWidth)}px`);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [scrolledDown]);

  useEffect(() => {
    document.body.classList.toggle('scrolled-down', scrolledDown);
  }, [scrolledDown]);

  const onBrand = () => {
    if (sidebarOpen) {
      setSidebarOpen(false);
      return;
    }
    const wide = typeof window !== 'undefined' && window.matchMedia('(min-width: 700px)').matches;
    if (wide && !scrolledDown) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSidebarOpen(true);
  };

  const onKeySlash = (e: KeyboardEvent) => {
    if (e.key !== '/') return;
    const tag = (document.activeElement?.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    e.preventDefault();
    document.getElementById('q-input')?.focus();
  };

  useEffect(() => {
    document.addEventListener('keydown', onKeySlash);
    return () => document.removeEventListener('keydown', onKeySlash);
  }, []);

  return (
    <header className="site-header" ref={headerRef}>
      <div className="wrap bar">
        <button
          ref={brandRef}
          className="brand"
          type="button"
          aria-label="Abrir menú"
          aria-expanded={sidebarOpen}
          onClick={onBrand}
        >
          <span className="brand-word">
            Javier <i>PC</i>
          </span>
          <span className="hamburger" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </button>

        <label className="search">
          <input
            id="q-input"
            type="search"
            placeholder="Buscar…"
            autoComplete="off"
            aria-label="Buscar juegos"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button
            className="search-clear"
            type="button"
            aria-label="Limpiar búsqueda"
            hidden={!q}
            onClick={() => {
              setQ('');
              document.getElementById('q-input')?.focus();
            }}
          >
            ×
          </button>
          <kbd aria-hidden="true">/</kbd>
        </label>

        <nav className="desktop-nav" aria-label="Navegación">
          <button className="nav-link" type="button" onClick={() => openDialog('favorites')}>
            Favoritos
            <span className="badge" hidden={!favCount}>
              {favCount}
            </span>
          </button>
          <button className="nav-link" type="button" onClick={() => openDialog('collection')}>
            Colección
            <span className="badge" hidden={!collCount}>
              {collCount}
            </span>
          </button>
          <button className="nav-link nav-list" type="button" onClick={() => openDialog('cart')}>
            Lista
            <span className="badge" hidden={!listCount}>
              {listCount}
            </span>
          </button>
          <button
            className="nav-link"
            type="button"
            onClick={() => document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >
            Contacto
          </button>
        </nav>
      </div>
    </header>
  );
}
