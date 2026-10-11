'use client';

import { useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { AdminIcon, type AdminIconName } from './icons';
import { hue, ini } from '@/lib/admin/format';
import type { PageMeta } from '@/lib/admin/types';
import { getServerToasts, getToasts, subscribeToasts } from '@/lib/admin/toast';

export function PageHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="ph">
      <div>
        <h1>{title}</h1>
        {sub ? <p>{sub}</p> : null}
      </div>
      {actions ? <div className="pa">{actions}</div> : null}
    </header>
  );
}

export function Badge({ tone = '', children }: { tone?: string; children: ReactNode }) {
  return <span className={`bd2${tone ? ` ${tone}` : ''}`}>{children}</span>;
}

export function roleBadge(role: string | null | undefined): ReactNode {
  if (!role) return null;
  return <Badge tone={role === 'SUPER_ADMIN' ? 'au' : 'in'}>{role}</Badge>;
}

export function Avatar({ label }: { label: string }) {
  return <span className="av">{label.slice(0, 1).toUpperCase()}</span>;
}

export function StateBox({
  icon,
  title,
  text,
  children,
}: {
  icon: AdminIconName;
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div className="state">
      <AdminIcon name={icon} />
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {children}
    </div>
  );
}

export function EmptyBox({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return <StateBox icon="games" title={title} text={text}>{action}</StateBox>;
}

export function ErrorBox({ onRetry }: { onRetry: () => void }) {
  return (
    <StateBox
      icon="alert"
      title="No se pudo cargar"
      text="Revisa tu conexión e inténtalo de nuevo. No se perdió ningún cambio guardado."
    >
      <button className="btn" type="button" onClick={onRetry}>
        <AdminIcon name="refresh" />
        Reintentar
      </button>
    </StateBox>
  );
}

export function DeniedBox() {
  return (
    <StateBox
      icon="lock"
      title="Sin permiso"
      text="Tu rol no puede ver esta sección. El backend también la rechazaría (403): esta pantalla solo lo representa."
    >
      <Link className="btn" href="/admin">
        Volver al dashboard
      </Link>
    </StateBox>
  );
}

export function NotFoundBox() {
  return (
    <StateBox
      icon="search"
      title="No encontrado"
      text="Ese elemento no existe en tu negocio o fue eliminado."
    >
      <Link className="btn" href="/admin/juegos">
        Ir a juegos
      </Link>
    </StateBox>
  );
}

export function Skeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, index) => (
        <div className="sk" key={index} />
      ))}
    </div>
  );
}

export function SearchRow({
  value,
  onChange,
  placeholder,
  label,
  onOpenFilters,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  onOpenFilters?: () => void;
}) {
  return (
    <div className="sr">
      <div className="srch">
        <AdminIcon name="search" />
        <input
          type="search"
          placeholder={placeholder}
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {onOpenFilters ? (
        <button className="btn fbtn" type="button" onClick={onOpenFilters}>
          <AdminIcon name="filter" />
          Filtros
        </button>
      ) : null}
    </div>
  );
}

export function FiltersPanel({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <div
        className={`fbd${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={`filters${open ? ' open' : ''}`} role="group" aria-label="Filtros">
        <div className="sh">
          <b>Filtros</b>
          <button className="btn pri sm" type="button" onClick={onClose}>
            Listo
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

export function Field({
  label,
  children,
  className = '',
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`f${className ? ` ${className}` : ''}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function ListShell({
  cols,
  head,
  children,
}: {
  cols: string;
  head?: string[];
  children: ReactNode;
}) {
  return (
    <div className="list" style={{ '--cols': cols } as CSSProperties}>
      {head ? (
        <div className="lh">
          {head.map((label, index) => (
            <span key={`${label}-${index}`}>{label}</span>
          ))}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export function Pager({
  meta,
  onPage,
}: {
  meta: PageMeta;
  onPage: (page: number) => void;
}) {
  if (meta.totalPages <= 1) return null;
  const from = (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <>
      <p className="cnt">
        Mostrando {from}–{to} de {meta.total}
      </p>
      <div className="pa">
        <button
          className="btn sm"
          type="button"
          disabled={meta.page <= 1}
          onClick={() => onPage(meta.page - 1)}
        >
          Anterior
        </button>
        <button
          className="btn sm"
          type="button"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPage(meta.page + 1)}
        >
          Siguiente
        </button>
      </div>
    </>
  );
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const timer = setTimeout(() => {
      const focusable = document.querySelector<HTMLElement>('.ov .md input, .ov .md select, .ov .md textarea, .ov .md .btn.pri');
      focusable?.focus();
    }, 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      clearTimeout(timer);
    };
  }, [onClose]);

  return (
    <div className="ov" onClick={onClose}>
      <div
        className={`md${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mh">
          <h3>{title}</h3>
          <button className="ib" type="button" title="Cerrar" aria-label="Cerrar" onClick={onClose}>
            <AdminIcon name="x" />
          </button>
        </div>
        <div className="mb">{children}</div>
        <div className="mf">{footer}</div>
      </div>
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  ariaLabel: string;
}) {
  return (
    <span className="swc">
      <button
        className="sw"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        type="button"
        onClick={() => onChange(!checked)}
      />
      {label ?? (checked ? 'Activo' : 'Inactivo')}
    </span>
  );
}

export function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="tgl">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="trk" />
      <b>{children}</b>
    </label>
  );
}

export function TabsLinks({
  items,
  active,
}: {
  items: ReadonlyArray<{ key: string; label: string; href: string; badge?: number }>;
  active: string;
}) {
  return (
    <nav className="tabs" aria-label="Secciones">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={item.key === active ? 'on' : undefined}
          aria-current={item.key === active ? 'page' : undefined}
        >
          {item.label}
          {item.badge !== undefined ? <em>{item.badge}</em> : null}
        </Link>
      ))}
    </nav>
  );
}

export function TabsButtons({
  items,
  active,
  onSelect,
}: {
  items: ReadonlyArray<{ key: string; label: string; count: number }>;
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Filtros multimedia">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="tab"
          aria-selected={item.key === active}
          className={item.key === active ? 'on' : undefined}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
          <em>{item.count}</em>
        </button>
      ))}
    </div>
  );
}

export function ArtThumb({
  title,
  url,
  className = '',
}: {
  title: string;
  url?: string | null;
  className?: string;
}) {
  return (
    <div
      className={`art${className ? ` ${className}` : ''}`}
      style={{ '--h': hue(title) } as CSSProperties}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- portadas de Cloudinary; next/image exige remotePatterns */}
      {url ? <img src={url} alt="" loading="lazy" /> : <span>{ini(title)}</span>}
    </div>
  );
}

export function ToastHost() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, getServerToasts);
  if (items.length === 0) return null;
  return (
    <div className="toast" aria-live="polite">
      {items.map((item) => (
        <div key={item.id} className={item.kind || undefined}>
          {item.text}
        </div>
      ))}
    </div>
  );
}
