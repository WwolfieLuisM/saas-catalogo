'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AdminIcon } from '@/components/admin/icons';
import { TopbarTitleProvider, type TopbarTitleSetter } from '@/components/admin/title';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { BNAV, navActive, navGroupsFor, navHref, titleFor } from '@/lib/admin/nav';

export default function AdminPanelLayout({ children }: { children: ReactNode }) {
  const { status, user, logout } = useAdminAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [override, setOverride] = useState<{ path: string; title: string } | null>(null);

  useEffect(() => {
    if (status === 'anonymous') router.replace('/admin/login');
  }, [status, router]);

  const setTitle = useCallback<TopbarTitleSetter>((path, next) => {
    setOverride({ path, title: next });
  }, []);

  if (status !== 'authenticated' || !user) {
    return (
      <div className="adm-splash" role="status" aria-live="polite">
        <div className="sk" aria-hidden="true" />
        Cargando panel…
      </div>
    );
  }

  const title = override && override.path === pathname ? override.title : titleFor(pathname);
  const close = () => setDrawer(false);
  const toggle = () => setDrawer((open) => !open);
  const groups = navGroupsFor(user.role);

  return (
    <TopbarTitleProvider value={setTitle}>
      <div className="app">
        <aside className={`side${drawer ? ' open' : ''}`} aria-label="Navegación principal">
          <div className="brand">
            <b>
              JAVIER
            </b>
            <small>Panel de administración</small>
          </div>
          <nav className="nav">
            {groups.map((group) => (
              <div key={group.group}>
                <div className="ng">{group.group}</div>
                {group.items.map((item) => {
                  const on = navActive(pathname, item.key);
                  return (
                    <Link
                      key={item.key}
                      href={navHref(item.key)}
                      className={`nl${item.icon ? '' : ' sub'}${on ? ' on' : ''}`}
                      aria-current={on ? 'page' : undefined}
                      onClick={close}
                    >
                      {item.icon ? <AdminIcon name={item.icon} /> : null}
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sf">
            <b>JAVIER</b>
            <br />
            Panel de administración
          </div>
        </aside>
        <div className="main">
          <header className="top">
            <button
              className="ib menu-btn"
              type="button"
              onClick={toggle}
              aria-label="Abrir menú"
              aria-expanded={drawer}
            >
              <AdminIcon name="menu" />
            </button>
            <div className="tt">{title}</div>
            <div className="sp" />
            <button className="btn sm" type="button" onClick={() => void logout()}>
              Salir
            </button>
            <div className="me">
              <span className="av">{user.username.slice(0, 1).toUpperCase()}</span>
              <span>
                {user.username}
                <small>{user.role}</small>
              </span>
            </div>
          </header>
          <main className="view" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <nav className="bnav" aria-label="Navegación rápida">
        {BNAV.map((item) => {
          const on = navActive(pathname, item.key);
          return (
            <Link
              key={item.key}
              href={navHref(item.key)}
              className={on ? 'on' : undefined}
              aria-current={on ? 'page' : undefined}
              onClick={close}
            >
              {item.icon ? <AdminIcon name={item.icon} /> : null}
              {item.label}
            </Link>
          );
        })}
        <button type="button" onClick={toggle} aria-label="Abrir menú completo">
          <AdminIcon name="menu" />
          Menú
        </button>
      </nav>
    </TopbarTitleProvider>
  );
}
