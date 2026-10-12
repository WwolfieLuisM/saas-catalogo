'use client';

import { useFeed } from '@/hooks/useFeed';

export function Sidebar() {
  const {
    sidebarOpen,
    setSidebarOpen,
    openDialog,
    games,
    favorites,
    status,
    list,
  } = useFeed();

  const favCount = favorites.length;
  const collCount = games.filter((g) => favorites.includes(g.id) || status[g.id]).length;
  const listCount = list.length;

  const go = (n: string) => {
    setSidebarOpen(false);
    if (n === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
    if (n === 'games')
      document.getElementById('catalog-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (n === 'help') openDialog('welcome');
    if (n === 'favorites') openDialog('favorites');
    if (n === 'collection') openDialog('collection');
    if (n === 'list') openDialog('cart');
    if (n === 'contact')
      document.getElementById('contact')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <>
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`} aria-hidden={!sidebarOpen}>
        <div className="sidebar-head">
          <b>
            JAVIER
          </b>
          <button
            className="sidebar-close"
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setSidebarOpen(false)}
          >
            ×
          </button>
        </div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          <button type="button" onClick={() => go('home')}>
            Inicio
          </button>
          <button type="button" onClick={() => go('games')}>
            Juegos
          </button>
          <button type="button" onClick={() => go('favorites')}>
            Favoritos <span hidden={!favCount}>{favCount}</span>
          </button>
          <button type="button" onClick={() => go('collection')}>
            Colección <span hidden={!collCount}>{collCount}</span>
          </button>
          <button type="button" onClick={() => go('list')}>
            Lista <span hidden={!listCount}>{listCount}</span>
          </button>
          <button type="button" onClick={() => go('contact')}>
            Contacto
          </button>
          <button type="button" onClick={() => go('help')}>
            ¿Cómo funciona?
          </button>
        </nav>
      </aside>
      <div
        className={`sidebar-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />
    </>
  );
}
