'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ApiError } from '@/lib/api/client';
import { adminFetch, adminFetchPaged } from '@/lib/admin/adminApi';
import { fmtSize } from '@/lib/admin/format';
import { priceFor, sizeToGb } from '@/lib/admin/preview';
import { toast } from '@/lib/admin/toast';
import type {
  BaseGameEntry,
  GameItem,
  PricingRule,
  TaxonomyItem,
  TenantPlatform,
} from '@/lib/admin/types';
import { useAdminList } from '@/hooks/useAdminList';
import { useTenantScope } from '@/hooks/useTenantScope';
import { AdminIcon } from '@/components/admin/icons';
import { LibEditModal } from '@/components/admin/LibEditModal';
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
} from '@/components/admin/ui';

type LibModal =
  | { mode: 'create' }
  | { mode: 'edit'; game: BaseGameEntry }
  | { mode: 'add'; game: BaseGameEntry }
  | null;

function LibAddModal({
  game,
  cats,
  rules,
  onClose,
  onSaved,
}: {
  game: BaseGameEntry;
  cats: TaxonomyItem[];
  rules: PricingRule[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [categoryId, setCategoryId] = useState(cats[0]?.id ?? '');
  const [platformId, setPlatformId] = useState(
    game.platforms.find((platform) => platform.slug === 'pc')?.id ?? game.platforms[0]?.id ?? '',
  );
  const [availability, setAvailability] = useState('1');
  const [busy, setBusy] = useState(false);
  const sizeGb = sizeToGb(game.sizeValue, game.sizeUnit);
  const sug = priceFor(sizeGb, rules);

  const submit = () => {
    setBusy(true);
    adminFetch<GameItem>('/admin/games', {
      method: 'POST',
      body: {
        baseGameId: game.id,
        platformId,
        ...(categoryId ? { categoryId } : {}),
        availability: availability === '1',
        priceMode: 'RULE',
      },
    })
      .then(() => {
        toast('Agregado a tu catálogo');
        onSaved();
        onClose();
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo agregar', 'bd');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title="Agregar al catálogo"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button className="btn pri" type="button" onClick={submit} disabled={busy || !platformId}>
            <AdminIcon name="plus" />
            Agregar
          </button>
        </>
      }
    >
      <p>
        <b>{game.title}</b>, {fmtSize(game.sizeValue, game.sizeUnit)}
      </p>
      <div className="grid2" style={{ marginTop: '12px' }}>
        <Field label="Categoría">
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Sin categoría</option>
            {cats.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Plataforma">
          <select
            value={platformId}
            onChange={(event) => setPlatformId(event.target.value)}
            disabled={game.platforms.length === 0}
          >
            {game.platforms.length === 0 ? <option value="">Sin plataformas</option> : null}
            {game.platforms.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Disponibilidad">
          <select value={availability} onChange={(event) => setAvailability(event.target.value)}>
            <option value="1">Disponible</option>
            <option value="0">No disponible</option>
          </select>
        </Field>
      </div>
      {game.platforms.length === 0 ? (
        <p className="hint" style={{ marginTop: '12px' }}>
          Este juego de la biblioteca no tiene plataformas asignadas. Añádele una antes de agregarlo
          a tu catálogo.
        </p>
      ) : (
        <p className="hint" style={{ marginTop: '12px' }}>
          Precio según tus reglas: <b>{sug === null ? 'sin regla aplicable' : `${sug} CUP`}</b>.
          Podrás cambiarlo después.
        </p>
      )}
    </Modal>
  );
}

export default function BibliotecaPage() {
  const scope = useTenantScope();
  const isSa = scope.isSa;
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [genreId, setGenreId] = useState('');
  const [platformId, setPlatformId] = useState('');
  const [notIn, setNotIn] = useState(false);
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [modal, setModal] = useState<LibModal>(null);
  const [catalogIds, setCatalogIds] = useState<Set<string> | null>(null);
  const [cats, setCats] = useState<TaxonomyItem[]>([]);
  const [gens, setGens] = useState<TaxonomyItem[]>([]);
  const [plats, setPlats] = useState<{ id: string; name: string }[]>([]);
  const [rules, setRules] = useState<PricingRule[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const listQuery = useMemo(
    () => ({
      page,
      limit: 20,
      sort: 'title',
      ...(debouncedQ ? { q: debouncedQ } : {}),
      ...(genreId ? { genreId } : {}),
      ...(platformId ? { platformId } : {}),
    }),
    [page, debouncedQ, genreId, platformId],
  );

  const { items, meta, error, reload } = useAdminList<BaseGameEntry>(
    '/admin/base-games',
    listQuery,
    { enabled: scope.ready },
  );

  useEffect(() => {
    if (isSa || !scope.ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      const ids = new Set<string>();
      const loadPage = (next: number): Promise<void> =>
        adminFetchPaged<GameItem>('/admin/games', {
          query: { page: next, limit: 100, origin: 'BIBLIOTECA', sort: 'title' },
        })
          .then((result) => {
            for (const row of result.data) {
              if (row.baseGameId) ids.add(row.baseGameId);
            }
            if (result.meta.page < result.meta.totalPages) return loadPage(next + 1);
          })
          .then(() => {
            if (!cancelled) setCatalogIds(ids);
          });
      loadPage(1).catch(() => {
        if (!cancelled) setCatalogIds(new Set());
      });
    });
    return () => {
      cancelled = true;
    };
  }, [isSa, scope.ready, scope.tenantId]);

  useEffect(() => {
    if (!scope.ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      Promise.all([
        adminFetchPaged<TaxonomyItem>('/admin/categories', {
          query: { page: 1, limit: 100, sort: 'name', global: true },
        }),
        adminFetchPaged<TaxonomyItem>('/admin/genres', {
          query: { page: 1, limit: 100, sort: 'name', global: true },
        }),
        isSa && !scope.scopeId
          ? adminFetchPaged<TaxonomyItem>('/admin/platforms', {
              query: { page: 1, limit: 100, sort: 'name', global: true },
            })
          : adminFetch<TenantPlatform[]>('/admin/tenant-platforms', {
              query: { tenantId: scope.scopeId },
            }).then((rows) => ({
              data: rows.filter((row) => row.enabled).map(({ id, name }) => ({ id, name })),
            })),
        isSa
          ? Promise.resolve(null)
          : adminFetch<PricingRule[]>('/admin/pricing/rules', {
              query: { tenantId: scope.scopeId },
            }),
      ])
        .then(([catRows, genRows, platRows, ruleRows]) => {
          if (cancelled) return;
          setCats(catRows.data);
          setGens(genRows.data);
          setPlats(platRows.data.map(({ id, name }) => ({ id, name })));
          setRules(ruleRows ?? []);
        })
        .catch(() => {
          if (!cancelled) {
            setCats([]);
            setGens([]);
            setPlats([]);
            setRules([]);
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, [isSa, scope.ready, scope.scopeId, scope.tenantId]);

  const rows = useMemo(() => {
    if (!items) return null;
    if (!notIn || !catalogIds) return items;
    return items.filter((item) => !catalogIds.has(item.id));
  }, [items, notIn, catalogIds]);

  const clearFilters = () => {
    setQ('');
    setDebouncedQ('');
    setGenreId('');
    setPlatformId('');
    setNotIn(false);
    setPage(1);
  };

  const sub = isSa
    ? 'Activo de la plataforma. Tú administras las fichas; cada negocio decide qué publica y a qué precio.'
    : 'Fichas listas para usar. Agrega las que quieras vender; el precio y la disponibilidad los defines tú.';

  const actions = isSa ? (
    <button className="btn pri" type="button" onClick={() => setModal({ mode: 'create' })}>
      <AdminIcon name="plus" />
      Nueva ficha en biblioteca
    </button>
  ) : (
    <Link className="btn" href="/admin/juegos/nuevo">
      <AdminIcon name="plus" />
      Crear juego personalizado
    </Link>
  );

  let content: ReactNode;
  if (error) {
    content = <ErrorBox onRetry={reload} />;
  } else if (rows === null) {
    content = <Skeleton rows={5} />;
  } else if (rows.length === 0) {
    content = (
      <EmptyBox
        title="Sin resultados"
        text="Ningún juego de la biblioteca coincide con la búsqueda."
        action={
          <button className="btn" type="button" onClick={clearFilters}>
            Limpiar filtros
          </button>
        }
      />
    );
  } else {
    content = (
      <>
        {meta ? (
          <p className="cnt">
            Mostrando {(meta.page - 1) * meta.pageSize + 1}–
            {Math.min(meta.total, meta.page * meta.pageSize)} de {meta.total} juegos
          </p>
        ) : null}
        <ListShell
          cols="minmax(0,2.4fr) 104px 118px 84px 150px"
          head={['Juego', 'Género', 'Plataformas', 'Tamaño', '']}
        >
          {rows.map((item) => {
            const inCatalog = catalogIds?.has(item.id) ?? false;
            return (
              <div className="li" key={item.id}>
                <div className="pc">
                  <div className="th-sm">
                    <ArtThumb title={item.title} />
                  </div>
                  <div className="nm">
                    <b>{item.title}</b>
                    <small>{item.releaseYear ?? '—'}</small>
                  </div>
                </div>
                <div data-l="Género">{item.genres.map((g) => g.name).join(', ') || '—'}</div>
                <div data-l="Plataformas">
                  {item.platforms.map((p) => p.name).join(', ') || '—'}
                </div>
                <div data-l="Tamaño">
                  {fmtSize(item.sizeValue, item.sizeUnit)}
                </div>
                <div className="ac">
                  {isSa ? (
                    <button
                      className="btn sm"
                      type="button"
                      onClick={() => setModal({ mode: 'edit', game: item })}
                    >
                      <AdminIcon name="edit" />
                      Editar ficha
                    </button>
                  ) : inCatalog ? (
                    <Badge tone="ok">En tu catálogo</Badge>
                  ) : (
                    <button
                      className="btn sm pri"
                      type="button"
                      disabled={catalogIds === null}
                      onClick={() => setModal({ mode: 'add', game: item })}
                    >
                      <AdminIcon name="plus" />
                      Agregar al catálogo
                    </button>
                  )}
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
      <PageHead title="Biblioteca base" sub={sub} actions={actions} />
      {!isSa ? (
        <div className="note">
          La biblioteca es de solo lectura para tu rol. Los datos base no se pueden modificar desde
          tu negocio.
        </div>
      ) : null}
      <SearchRow
        value={q}
        onChange={(value) => {
          setQ(value);
          setPage(1);
        }}
        placeholder="Buscar en la biblioteca"
        label="Buscar en la biblioteca"
        onOpenFilters={() => setFiltersOpen(true)}
      />
      <FiltersPanel open={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <Field label="Género">
          <select
            value={genreId}
            onChange={(event) => {
              setGenreId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            {gens.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Plataforma">
          <select
            value={platformId}
            onChange={(event) => {
              setPlatformId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todas</option>
            {plats.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Field>
        {!isSa ? (
          <Field label="En mi catálogo">
            <select
              value={notIn ? '1' : ''}
              onChange={(event) => {
                setNotIn(event.target.value === '1');
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="1">Solo fuera de mi catálogo</option>
            </select>
          </Field>
        ) : null}
      </FiltersPanel>
      {content}
      {modal?.mode === 'create' || modal?.mode === 'edit' ? (
        <LibEditModal
          game={modal.mode === 'edit' ? modal.game : null}
          onClose={() => setModal(null)}
          onSaved={reload}
        />
      ) : null}
      {modal?.mode === 'add' ? (
        <LibAddModal
          game={modal.game}
          cats={cats}
          rules={rules}
          onClose={() => setModal(null)}
          onSaved={() => {
            setCatalogIds((prev) => {
              const next = new Set(prev ?? []);
              next.add(modal.game.id);
              return next;
            });
          }}
        />
      ) : null}
    </>
  );
}
