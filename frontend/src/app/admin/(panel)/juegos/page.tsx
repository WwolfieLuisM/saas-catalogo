'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { adminFetch, adminFetchPaged } from '@/lib/admin/adminApi';
import { nf } from '@/lib/admin/format';
import { toast } from '@/lib/admin/toast';
import type { GameItem, TaxonomyItem } from '@/lib/admin/types';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminList } from '@/hooks/useAdminList';
import { useTenantScope } from '@/hooks/useTenantScope';
import { AdminIcon } from '@/components/admin/icons';
import { GameHistoryModal } from '@/components/admin/GameHistoryModal';
import {
  ArtThumb,
  Badge,
  EmptyBox,
  ErrorBox,
  Field,
  FiltersPanel,
  ListShell,
  Modal,
  PageHead,
  Pager,
  SearchRow,
  Skeleton,
  Switch,
} from '@/components/admin/ui';

function JuegosList() {
  const scope = useTenantScope();
  const router = useRouter();
  const { user } = useAdminAuth();
  const isSa = user?.role === 'SUPER_ADMIN';
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [cat, setCat] = useState('');
  const [av, setAv] = useState('');
  const [origin, setOrigin] = useState('');
  const [sort, setSort] = useState('title');
  const [cats, setCats] = useState<TaxonomyItem[] | null>(null);
  const [history, setHistory] = useState<GameItem | null>(null);
  const [removing, setRemoving] = useState<GameItem | null>(null);
  const [removingBusy, setRemovingBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    if (!scope.ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      adminFetchPaged<TaxonomyItem>('/admin/categories', {
        query: { page: 1, limit: 100, sort: 'name', tenantId: scope.scopeId },
      })
        .then((result) => {
          if (!cancelled) setCats(result.data);
        })
        .catch(() => {
          if (!cancelled) setCats([]);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [scope.ready, scope.scopeId, scope.tenantId]);

  const { items, meta, error, reload } = useAdminList<GameItem>(
    '/admin/games',
    {
      page,
      limit: 20,
      q: debouncedQ || undefined,
      sort,
      tenantId: scope.scopeId,
      categoryId: cat || undefined,
      availability: av || undefined,
      origin: origin || undefined,
    },
    { enabled: scope.ready },
  );

  const hasFilters = debouncedQ !== '' || cat !== '' || av !== '' || origin !== '';

  const clearFilters = () => {
    setQ('');
    setDebouncedQ('');
    setCat('');
    setAv('');
    setOrigin('');
  };

  const toggleAvailability = (game: GameItem) => {
    adminFetch(`/admin/games/${game.id}`, {
      method: 'PATCH',
      body: { availability: !game.availability },
    })
      .then(() => {
        toast(game.availability ? 'Marcado como no disponible' : 'Marcado como disponible');
        reload();
      })
      .catch((cause: unknown) => {
        toast(
          cause instanceof ApiError ? cause.message : 'No se pudo actualizar la disponibilidad',
          'bd',
        );
      });
  };

  const duplicate = (game: GameItem) => {
    adminFetch<GameItem>(`/admin/games/${game.id}/duplicate`, { method: 'POST' })
      .then((created) => {
        toast('Copia creada como juego personalizado (no disponible)');
        router.push(`/admin/juegos/${created.id}/editar`);
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo duplicar', 'bd');
      });
  };

  const confirmRemove = () => {
    if (!removing || removingBusy) return;
    setRemovingBusy(true);
    adminFetch(`/admin/games/${removing.id}`, { method: 'DELETE' })
      .then(() => {
        toast('Juego enviado a la papelera');
        setRemoving(null);
        reload();
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo eliminar', 'bd');
      })
      .finally(() => setRemovingBusy(false));
  };

  const tenantName =
    scope.isSa && scope.tenants
      ? (scope.tenants.find((tenant) => tenant.id === scope.tenantId)?.name ?? '')
      : '';
  const sub = scope.isSa
    ? tenantName
      ? `Catálogo de ${tenantName}. Todo lo que cambies queda registrado en auditoría.`
      : 'Todo lo que cambies queda registrado en auditoría.'
    : 'Catálogo de tu negocio. Todo lo que cambies queda registrado en auditoría.';

  const actions = (
    <>
      {scope.isSa && scope.tenants ? (
        <select
          aria-label="Negocio"
          value={scope.tenantId}
          onChange={(event) => {
            scope.setTenantId(event.target.value);
            setPage(1);
            setCat('');
          }}
        >
          {scope.tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name}
            </option>
          ))}
        </select>
      ) : null}
      <Link className="btn" href="/admin/biblioteca">
        <AdminIcon name="library" />
        Desde biblioteca
      </Link>
      <Link className="btn pri" href="/admin/juegos/nuevo">
        <AdminIcon name="plus" />
        Crear juego personalizado
      </Link>
    </>
  );

  if (scope.error) {
    return (
      <>
        <PageHead title="Juegos" sub={sub} actions={actions} />
        <ErrorBox onRetry={scope.reload} />
      </>
    );
  }

  if (!scope.ready) {
    return (
      <>
        <PageHead title="Juegos" sub={sub} actions={actions} />
        <Skeleton rows={5} />
      </>
    );
  }

  if (scope.noTenants) {
    return (
      <>
        <PageHead title="Juegos" sub={sub} actions={actions} />
        <EmptyBox
          title="Aún no hay negocios"
          text="Crea un negocio para gestionar su catálogo."
          action={
            <Link className="btn" href="/admin/negocios">
              Ir a negocios
            </Link>
          }
        />
      </>
    );
  }

  let content: ReactNode;
  if (error) {
    content = <ErrorBox onRetry={reload} />;
  } else if (items === null) {
    content = <Skeleton rows={5} />;
  } else if (items.length === 0) {
    content = hasFilters ? (
      <EmptyBox
        title="Nada coincide con tus filtros"
        text="Prueba con otra búsqueda o limpia los filtros."
        action={
          <button className="btn" type="button" onClick={clearFilters}>
            Limpiar filtros
          </button>
        }
      />
    ) : (
      <EmptyBox
        title="No hay juegos todavía"
        text="Agrega juegos desde la biblioteca base o crea uno propio."
        action={
          <div className="pa">
            <Link className="btn pri" href="/admin/biblioteca">
              Explorar biblioteca
            </Link>
            <Link className="btn" href="/admin/juegos/nuevo">
              Crear juego
            </Link>
          </div>
        }
      />
    );
  } else {
    content = (
      <>
        <p className="cnt">
          {meta ? meta.total : items.length} {meta && meta.total === 1 ? 'juego' : 'juegos'}
        </p>
        <ListShell
          cols="minmax(0,2.4fr) 84px 92px 118px 112px minmax(0,auto)"
          head={['Juego', 'Tamaño', 'Precio', 'Origen', 'Plataformas', '']}
        >
          {items.map((game) => {
            const metaLine = [game.genres[0]?.name, game.category?.name]
              .filter(Boolean)
              .join(', ');
            return (
              <div className="li" key={game.id}>
                <div className="pc">
                  <Link
                    className="th"
                    href={`/admin/juegos/${game.id}`}
                    aria-label={`Ver ${game.title}`}
                  >
                    <ArtThumb title={game.title} />
                  </Link>
                  <div className="nm">
                    <Link href={`/admin/juegos/${game.id}`}>
                      <b>{game.title}</b>
                    </Link>
                    <small>{metaLine || '—'}</small>
                  </div>
                </div>
                <div data-l="Tamaño">
                  {game.sizeValue !== null ? `${nf(game.sizeValue)} ${game.sizeUnit}` : '—'}
                </div>
                <div data-l="Precio">
                  {game.price === null ? (
                    <Badge tone="wn">Sin regla</Badge>
                  ) : (
                    `${nf(game.price)} CUP`
                  )}
                </div>
                <div data-l="Origen">
                  {game.origin === 'BIBLIOTECA' ? (
                    <Badge tone="in">Biblioteca</Badge>
                  ) : (
                    <Badge tone="au">Personalizado</Badge>
                  )}
                </div>
                <div data-l="Plataformas">
                  {game.platforms.map((platform) => platform.name).join(', ') || '—'}
                </div>
                <div className="ac">
                  <Switch
                    checked={game.availability}
                    ariaLabel={`Disponibilidad de ${game.title}`}
                    label={game.availability ? 'Disponible' : 'No disponible'}
                    onChange={() => toggleAvailability(game)}
                  />
                  <Link
                    className="ib"
                    href={`/admin/juegos/${game.id}`}
                    title="Ver"
                    aria-label={`Ver ${game.title}`}
                  >
                    <AdminIcon name="eye" />
                  </Link>
                  <Link
                    className="ib"
                    href={`/admin/juegos/${game.id}/editar`}
                    title="Editar"
                    aria-label={`Editar ${game.title}`}
                  >
                    <AdminIcon name="edit" />
                  </Link>
                  <Link
                    className="ib"
                    href={`/admin/juegos/${game.id}/editar#sec-media`}
                    title="Multimedia"
                    aria-label={`Multimedia de ${game.title}`}
                  >
                    <AdminIcon name="image" />
                  </Link>
                  <button
                    className="ib"
                    type="button"
                    title="Duplicar"
                    aria-label={`Duplicar ${game.title}`}
                    onClick={() => duplicate(game)}
                  >
                    <AdminIcon name="copy" />
                  </button>
                  {isSa ? (
                    <button
                      className="ib"
                      type="button"
                      title="Historial"
                      aria-label={`Historial de ${game.title}`}
                      onClick={() => setHistory(game)}
                    >
                      <AdminIcon name="clock" />
                    </button>
                  ) : null}
                  <button
                    className="ib dng"
                    type="button"
                    title="Eliminar"
                    aria-label={`Eliminar ${game.title}`}
                    onClick={() => setRemoving(game)}
                  >
                    <AdminIcon name="trash" />
                  </button>
                </div>
              </div>
            );
          })}
        </ListShell>
        {meta ? <Pager meta={meta} onPage={setPage} /> : null}
      </>
    );
  }

  return (
    <>
      <PageHead title="Juegos" sub={sub} actions={actions} />
      <SearchRow
        value={q}
        onChange={(value) => {
          setQ(value);
          setPage(1);
        }}
        placeholder="Buscar juego"
        label="Buscar juego"
        onOpenFilters={() => setFiltersOpen(true)}
      />
      <FiltersPanel open={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <Field label="Categoría">
          <select value={cat} onChange={(event) => { setCat(event.target.value); setPage(1); }}>
            <option value="">Todas</option>
            {cats?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Disponibilidad">
          <select value={av} onChange={(event) => { setAv(event.target.value); setPage(1); }}>
            <option value="">Todas</option>
            <option value="true">Disponible</option>
            <option value="false">No disponible</option>
          </select>
        </Field>
        <Field label="Origen">
          <select value={origin} onChange={(event) => { setOrigin(event.target.value); setPage(1); }}>
            <option value="">Todos</option>
            <option value="BIBLIOTECA">Biblioteca</option>
            <option value="PERSONALIZADO">Personalizado</option>
          </select>
        </Field>
        <Field label="Ordenar por">
          <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
            <option value="title">Nombre</option>
            <option value="price">Precio</option>
          </select>
        </Field>
      </FiltersPanel>
      {content}
      {isSa && history ? (
        <GameHistoryModal
          gameId={history.id}
          title={history.title}
          onClose={() => setHistory(null)}
        />
      ) : null}
      {removing ? (
        <Modal
          title="Eliminar juego"
          onClose={() => setRemoving(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setRemoving(null)}>
                Cancelar
              </button>
              <button
                className="btn dng"
                type="button"
                onClick={confirmRemove}
                disabled={removingBusy}
              >
                Eliminar
              </button>
            </>
          }
        >
          <p>
            &quot;{removing.title}&quot; saldrá del catálogo y pasará a la papelera. Podrás
            restaurarlo.
          </p>
        </Modal>
      ) : null}
    </>
  );
}

export default function JuegosPage() {
  return <JuegosList />;
}
