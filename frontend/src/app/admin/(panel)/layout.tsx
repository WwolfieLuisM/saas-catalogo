'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AdminIcon } from '@/components/admin/icons';
import { OffBar } from '@/components/admin/OffBar';
import { Badge, Modal } from '@/components/admin/ui';
import { TopbarTitleProvider, type TopbarTitleSetter } from '@/components/admin/title';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useTenantScope } from '@/hooks/useTenantScope';
import { BNAV, navActive, navGroupsFor, navHref, titleFor } from '@/lib/admin/nav';

export default function AdminPanelLayout({ children }: { children: ReactNode }) {
  const { status, user, logout } = useAdminAuth();
  const scope = useTenantScope();
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [override, setOverride] = useState<{ path: string; title: string } | null>(null);
  const [meOpen, setMeOpen] = useState(false);

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
  const tenantName = scope.tenantName ?? 'Tu negocio';

  return (
    <TopbarTitleProvider value={setTitle}>
      <div className="app">
        <aside className={`side${drawer ? ' open' : ''}`} aria-label="Navegación principal">
          <div className="brand">
            <b>
              Luismi <i>Platform</i>
            </b>
            <small>Panel de administración</small>
          </div>
          <div className="tnt">
            Tenant actual: <b>{tenantName}</b>
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
            <b>Luismi Platform</b>
            <br />
            Plataforma desarrollada y mantenida por Luismi.
            <br />
            Admin V2
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
            {scope.isSa && scope.tenants && scope.tenants.length > 0 ? (
              <select
                className="tntsel"
                aria-label="Seleccionar negocio"
                value={scope.tenantId}
                disabled={scope.loading}
                onChange={(event) => scope.setTenantId(event.target.value)}
              >
                {scope.tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="pill tnt-t">Tenant actual: {tenantName}</span>
            )}
            <button
              className="me"
              type="button"
              onClick={() => setMeOpen(true)}
              aria-label="Información de usuario"
            >
              <span className="av">{user.username.slice(0, 1).toUpperCase()}</span>
              <span>
                {user.username}
                <small>{user.role}</small>
              </span>
            </button>
          </header>
          <OffBar />
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
      {meOpen ? (
        <Modal
          title="Sesión"
          onClose={() => setMeOpen(false)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setMeOpen(false)}>
                Cerrar
              </button>
              <button
                className="btn pri"
                type="button"
                onClick={() => {
                  setMeOpen(false);
                  void logout();
                }}
              >
                Cerrar sesión
              </button>
            </>
          }
        >
          <div className="rows">
            <div>
              <div className="gr">
                <b>{user.username}</b>
              </div>
              <Badge tone={user.role === 'SUPER_ADMIN' ? 'au' : 'in'}>{user.role}</Badge>
            </div>
            {user.tenantId ? (
              <div>
                <div className="gr">
                  <b>{tenantName}</b>
                </div>
                <small className="mono">{user.tenantId}</small>
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </TopbarTitleProvider>
  );
}
