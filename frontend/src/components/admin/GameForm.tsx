'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { adminFetch, adminFetchPaged } from '@/lib/admin/adminApi';
import { nf, slugify } from '@/lib/admin/format';
import {
  deleteGameCover,
  deleteGameShot,
  fetchMediaManifest,
  uploadGameCover,
  uploadGameShot,
  validateImageFile,
} from '@/lib/admin/mediaApi';
import { priceFor, reqFor, sizeToGb } from '@/lib/admin/preview';
import { toast } from '@/lib/admin/toast';
import type {
  GameItem,
  GameRequirements,
  MediaEntry,
  MediaManifest,
  MediaKind,
  PricingRule,
  TaxonomyItem,
} from '@/lib/admin/types';
import { useTenantScope } from '@/hooks/useTenantScope';
import { AdminIcon } from './icons';
import { ArtThumb, EmptyBox, ErrorBox, Field, Modal, PageHead, Skeleton, Toggle } from './ui';

const CPU_OPTS = ['Intel i3', 'Intel i5', 'Intel i7', 'Intel i9', 'Ryzen 3', 'Ryzen 5', 'Ryzen 7', 'Ryzen 9', 'Otro'];
const GPU_OPTS = ['GTX', 'RTX', 'RX', 'Intel Arc', 'Otro'];
const RAM_OPTS = [2, 4, 6, 8, 12, 16, 32, 64];
const OS_OPTS = ['Windows 10 64-bit', 'Windows 11 64-bit'];
const DX_OPTS = [10, 11, 12];
const STORAGE_OPTS = ['HDD', 'SSD'];

interface ReqState {
  cpu: string;
  cpuModel: string;
  gpu: string;
  gpuModel: string;
  ram: string;
  os: string;
  dx: string;
  storage: string;
}

function splitOption(value: string, options: string[]): [string, string] {
  if (!value) return ['', ''];
  if (options.includes(value)) return [value, ''];
  const match = options.find((option) => option !== 'Otro' && value.startsWith(`${option} `));
  if (match) return [match, value.slice(match.length + 1)];
  return [value, ''];
}

function ramValue(label: string): string {
  if (!label) return '';
  const parsed = parseInt(label, 10);
  return Number.isFinite(parsed) && `${parsed} GB` === label ? String(parsed) : label;
}

function dxValue(label: string): string {
  if (!label) return '';
  const match = /^DirectX (\d+)$/.exec(label);
  return match ? match[1] : label;
}

function hydrateReq(raw: GameRequirements | null | undefined, sizeGb: number): ReqState {
  const source = raw ?? reqFor(sizeGb || 10).min;
  const [cpu, cpuModel] = splitOption(source.cpu ?? '', CPU_OPTS);
  const [gpu, gpuModel] = splitOption(source.gpu ?? '', GPU_OPTS);
  return {
    cpu,
    cpuModel,
    gpu,
    gpuModel,
    ram: ramValue(source.ram ?? ''),
    os: source.os ?? '',
    dx: dxValue(source.directX ?? ''),
    storage: source.storage ?? '',
  };
}

function hydrateRec(raw: GameRequirements | null | undefined, sizeGb: number): ReqState {
  const source = raw ?? reqFor(sizeGb || 10).rec;
  return hydrateReq(source, sizeGb);
}

function reqBody(state: ReqState): GameRequirements {
  const ram = state.ram
    ? /^\d+$/.test(state.ram)
      ? `${state.ram} GB`
      : state.ram
    : '';
  const directX = state.dx
    ? /^\d+$/.test(state.dx)
      ? `DirectX ${state.dx}`
      : state.dx
    : '';
  return {
    cpu: [state.cpu, state.cpuModel].filter(Boolean).join(' '),
    gpu: [state.gpu, state.gpuModel].filter(Boolean).join(' '),
    ram,
    os: state.os,
    directX,
    storage: state.storage,
  };
}

function strOpts(values: ReadonlyArray<string | number>): Array<{ value: string; label: string }> {
  return values.map((value) => ({ value: String(value), label: String(value) }));
}

function Sel({
  value,
  onChange,
  options,
  emptyLabel,
  ariaLabel,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  emptyLabel?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const missing = value !== '' && !options.some((option) => option.value === value);
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {value === '' ? <option value="">{emptyLabel ?? '—'}</option> : null}
      {missing ? <option value={value}>{value}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type SlotTarget = { kind: MediaKind; replaceId?: string };

export function GameForm({ game }: { game: GameItem | null }) {
  const scope = useTenantScope();
  const router = useRouter();
  const editing = game !== null;
  const gameId = game?.id ?? '';
  const lock = game?.origin === 'BIBLIOTECA';

  const initSizeGb =
    game && game.sizeValue !== null && game.sizeValue !== undefined && game.sizeUnit
      ? Number(sizeToGb(game.sizeValue, game.sizeUnit).toFixed(3))
      : 10;

  const [cats, setCats] = useState<TaxonomyItem[] | null>(null);
  const [gens, setGens] = useState<TaxonomyItem[] | null>(null);
  const [plats, setPlats] = useState<TaxonomyItem[] | null>(null);
  const [rules, setRules] = useState<PricingRule[] | null>(null);
  const [taxError, setTaxError] = useState(false);
  const [taxTick, setTaxTick] = useState(0);

  const [title, setTitle] = useState(game?.title ?? '');
  const [categoryId, setCategoryId] = useState(game?.categoryId ?? '');
  const [genreId, setGenreId] = useState(game?.genres[0]?.id ?? '');
  const [releaseYear, setReleaseYear] = useState(
    game?.releaseYear !== null && game?.releaseYear !== undefined
      ? String(game.releaseYear)
      : String(new Date().getFullYear()),
  );
  const [description, setDescription] = useState(game?.description ?? '');
  const [sizeValue, setSizeValue] = useState(String(initSizeGb));
  const [platformIds, setPlatformIds] = useState<string[]>(
    game ? game.platforms.map((platform) => platform.id) : [],
  );
  const [minReq, setMinReq] = useState<ReqState>(() => hydrateReq(game?.minimumRequirements ?? null, initSizeGb));
  const [recReq, setRecReq] = useState<ReqState>(() => hydrateRec(game?.recommendedRequirements ?? null, initSizeGb));
  const [priceMode, setPriceMode] = useState(game?.priceMode === 'MANUAL' ? 'MANUAL' : 'RULE');
  const [price, setPrice] = useState(
    game?.price !== null && game?.price !== undefined ? String(game.price) : '',
  );
  const [availability, setAvailability] = useState(game?.availability ?? true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const [manifest, setManifest] = useState<MediaManifest | null>(null);
  const [manifestTick, setManifestTick] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [pick, setPick] = useState<SlotTarget | null>(null);
  const [removingMedia, setRemovingMedia] = useState<{ kind: MediaKind; id: string } | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!scope.ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      const query = { page: 1, limit: 100, sort: 'name', tenantId: scope.scopeId };
      Promise.all([
        adminFetchPaged<TaxonomyItem>('/admin/categories', { query }),
        adminFetchPaged<TaxonomyItem>('/admin/genres', { query }),
        adminFetchPaged<TaxonomyItem>('/admin/platforms', { query }),
      ])
        .then(([catRows, genRows, platRows]) => {
          if (cancelled) return;
          setCats(catRows.data);
          setGens(genRows.data);
          setPlats(platRows.data);
          if (!editing) {
            setCategoryId((prev) => prev || catRows.data[0]?.id || '');
            setPlatformIds((prev) =>
              prev.length > 0
                ? prev
                : platRows.data.filter((platform) => platform.slug === 'pc').map((platform) => platform.id),
            );
          }
        })
        .catch(() => {
          if (!cancelled) setTaxError(true);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [scope.ready, scope.scopeId, scope.tenantId, editing, taxTick]);

  useEffect(() => {
    if (!scope.ready) return;
    let cancelled = false;
    queueMicrotask(() => {
      adminFetch<PricingRule[]>('/admin/pricing/rules', { query: { tenantId: scope.scopeId } })
        .then((rows) => {
          if (!cancelled) setRules(rows);
        })
        .catch(() => {
          if (!cancelled) setRules([]);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [scope.ready, scope.scopeId, scope.tenantId]);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    queueMicrotask(() => {
      fetchMediaManifest(gameId)
        .then((result) => {
          if (!cancelled) setManifest(result);
        })
        .catch(() => {
          if (!cancelled) setManifest(null);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [gameId, manifestTick]);

  const sizeNum = parseFloat(sizeValue.replace(',', '.'));
  const sizeGb = Number.isFinite(sizeNum) && sizeNum > 0 ? sizeNum : 0;
  const sug = rules ? priceFor(sizeGb, rules) : null;

  const openPick = (kind: MediaKind, replaceId?: string) => {
    if (!gameId || uploading) return;
    setPick({ kind, replaceId });
    fileRef.current?.click();
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !pick || !gameId) return;
    const bad = validateImageFile(file);
    if (bad) {
      toast(bad, 'bd');
      return;
    }
    const shots = manifest?.screenshots ?? [];
    if (!pick.replaceId && pick.kind === 'SHOT' && shots.length >= 4) {
      toast('Límite alcanzado: máximo 4 screenshots.', 'bd');
      return;
    }
    const target = pick;
    setPick(null);
    const key =
      target.kind === 'COVER' ? 'cover' : target.replaceId ? `shot-${target.replaceId}` : 'shot-new';
    setUploading(key);
    const run =
      target.kind === 'COVER'
        ? uploadGameCover(gameId, file)
        : (async () => {
            if (target.replaceId) await deleteGameShot(gameId, target.replaceId);
            await uploadGameShot(gameId, file);
          })();
    Promise.resolve(run)
      .then(() => {
        toast('Imagen sincronizada con Cloudinary');
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo subir la imagen', 'bd');
      })
      .finally(() => {
        setUploading(null);
        setManifestTick((value) => value + 1);
      });
  };

  const confirmRemoveMedia = () => {
    if (!removingMedia || !gameId || mediaBusy) return;
    setMediaBusy(true);
    const run =
      removingMedia.kind === 'COVER'
        ? deleteGameCover(gameId)
        : deleteGameShot(gameId, removingMedia.id);
    run
      .then(() => {
        toast('Archivo eliminado');
        setRemovingMedia(null);
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo eliminar el archivo', 'bd');
      })
      .finally(() => {
        setMediaBusy(false);
        setManifestTick((value) => value + 1);
      });
  };

  const save = () => {
    if (busy) return;
    const nextErrors: string[] = [];
    if (!lock) {
      const cleanTitle = title.trim();
      if (cleanTitle.length < 2 || cleanTitle.length > 150) nextErrors.push('Escribe el título.');
      if (!genreId) nextErrors.push('Elige un género.');
      if (!(sizeNum > 0)) nextErrors.push('El tamaño debe ser mayor que 0.');
      if (platformIds.length === 0) nextErrors.push('Elige al menos una plataforma.');
    }
    if (priceMode === 'MANUAL' && !(parseFloat(price) >= 0 && price.trim() !== '')) {
      nextErrors.push('Escribe el precio manual.');
    }
    setErrors(nextErrors);
    if (nextErrors.length > 0) {
      toast('Revisa los campos marcados', 'bd');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setBusy(true);

    const yearNum = parseInt(releaseYear, 10);
    const commercial = {
      priceMode,
      ...(priceMode === 'MANUAL' ? { price: parseFloat(price) } : {}),
      availability,
      categoryId: categoryId || null,
    };
    const requirements = {
      minimumRequirements: reqBody(minReq),
      recommendedRequirements: reqBody(recReq),
    };

    if (editing && game) {
      const patchBody: Record<string, unknown> = { ...commercial };
      if (!lock) {
        patchBody.title = title.trim();
        patchBody.description = description.trim() || null;
        patchBody.sizeValue = sizeNum;
        patchBody.sizeUnit = 'GB';
        if (Number.isFinite(yearNum)) patchBody.releaseYear = yearNum;
        patchBody.genreIds = [genreId];
        patchBody.platformIds = platformIds;
        patchBody.minimumRequirements = requirements.minimumRequirements;
        patchBody.recommendedRequirements = requirements.recommendedRequirements;
      }
      adminFetch<GameItem>(`/admin/games/${gameId}`, { method: 'PATCH', body: patchBody })
        .then(() => {
          toast('Juego guardado');
          router.push(`/admin/juegos/${gameId}`);
        })
        .catch((cause: unknown) => {
          toast(cause instanceof ApiError ? cause.message : 'No se pudo guardar el juego', 'bd');
          setBusy(false);
        });
      return;
    }

    const slug = slugify(title.trim());
    const createBody = {
      ...(scope.isSa && scope.tenantId ? { tenantId: scope.tenantId } : {}),
      title: title.trim(),
      ...(slug.length >= 3 && slug.length <= 50 ? { slug } : {}),
      description: description.trim() || null,
      sizeValue: sizeNum,
      sizeUnit: 'GB' as const,
      ...(Number.isFinite(yearNum) ? { releaseYear: yearNum } : {}),
      genreIds: [genreId],
      platformIds,
      ...commercial,
      ...requirements,
    };
    adminFetch<GameItem>('/admin/games', { method: 'POST', body: createBody })
      .then((created) => {
        toast('Juego creado. Ahora puedes subir multimedia.');
        router.push(`/admin/juegos/${created.id}/editar`);
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo crear el juego', 'bd');
        setBusy(false);
      });
  };

  const fsec = (secTitle: string, body: ReactNode, open = true, id?: string) => (
    <details className="fs" open={open} id={id}>
      <summary>
        {secTitle}
        <AdminIcon name="chev" />
      </summary>
      <div className="fb">{body}</div>
    </details>
  );

  const specBlock = (req: ReqState, setReq: (next: ReqState) => void, disabled: boolean) => {
    const patch = (part: Partial<ReqState>) => setReq({ ...req, ...part });
    return (
      <div className="spec">
        <Field label="Procesador">
          <Sel value={req.cpu} onChange={(cpu) => patch({ cpu })} options={strOpts(CPU_OPTS)} ariaLabel="Procesador" disabled={disabled} />
        </Field>
        <Field label="Modelo (opcional)">
          <input value={req.cpuModel} disabled={disabled} placeholder="Ej. 4590 o 2200G" onChange={(event) => patch({ cpuModel: event.target.value })} />
        </Field>
        <Field label="RAM">
          <Sel
            value={req.ram}
            onChange={(ram) => patch({ ram })}
            options={RAM_OPTS.map((n) => ({ value: String(n), label: `${n} GB` }))}
            ariaLabel="RAM"
            disabled={disabled}
          />
        </Field>
        <Field label="Gráficos">
          <Sel value={req.gpu} onChange={(gpu) => patch({ gpu })} options={strOpts(GPU_OPTS)} ariaLabel="Gráficos" disabled={disabled} />
        </Field>
        <Field label="Modelo (opcional)">
          <input value={req.gpuModel} disabled={disabled} placeholder="Ej. 1050 Ti" onChange={(event) => patch({ gpuModel: event.target.value })} />
        </Field>
        <Field label="DirectX">
          <Sel
            value={req.dx}
            onChange={(dx) => patch({ dx })}
            options={DX_OPTS.map((n) => ({ value: String(n), label: `DirectX ${n}` }))}
            ariaLabel="DirectX"
            disabled={disabled}
          />
        </Field>
        <Field label="Sistema operativo">
          <Sel value={req.os} onChange={(os) => patch({ os })} options={strOpts(OS_OPTS)} ariaLabel="Sistema operativo" disabled={disabled} />
        </Field>
        <Field label="Almacenamiento">
          <Sel value={req.storage} onChange={(storage) => patch({ storage })} options={strOpts(STORAGE_OPTS)} ariaLabel="Almacenamiento" disabled={disabled} />
        </Field>
      </div>
    );
  };

  const cover = manifest?.cover ?? null;
  const shots = manifest?.screenshots ?? [];

  const statusSuffix = (key: string, status?: string) => {
    if (uploading === key) return ' (subiendo)';
    if (!status || status === 'OK') return '';
    return status === 'PENDING' ? ' (subiendo)' : ' (error)';
  };

  const mediaSlot = (
    entry: Omit<MediaEntry, 'game'> | null,
    kind: MediaKind,
    label: string,
    key: string,
    replaceId?: string,
  ) => (
    <div className={`slot${kind === 'COVER' ? ' cv' : ''}`}>
      {entry?.url ? (
        <ArtThumb title={game?.title || label} url={entry.url} />
      ) : (
        <div className="art none">{kind === 'COVER' ? 'Sin portada' : 'Vacío'}</div>
      )}
      <small>
        {label}
        {statusSuffix(key, entry?.status)}
      </small>
      <div className="slot sa">
        <button className="btn sm" type="button" disabled={!!uploading} onClick={() => openPick(kind, replaceId)}>
          {entry ? 'Cambiar' : 'Subir'}
        </button>
        {entry ? (
          <button
            className="ib dng"
            type="button"
            title="Eliminar"
            aria-label={`Eliminar ${label}`}
            disabled={!!uploading}
            onClick={() => setRemovingMedia({ kind, id: entry.id })}
          >
            <AdminIcon name="trash" />
          </button>
        ) : null}
      </div>
    </div>
  );

  const sub = lock
    ? 'Este juego viene de la biblioteca base. Puedes ajustar solo lo comercial.'
    : 'Todo lo repetitivo se selecciona. Todo lo excepcional se escribe.';

  const hint = (
    <p className="hint">
      <Link href="/admin/juegos">Juegos</Link> / {editing ? game.title : 'Nuevo'}
    </p>
  );

  if (taxError) {
    return (
      <>
        {hint}
        <PageHead title={editing ? 'Editar juego' : 'Crear juego personalizado'} sub={sub} />
        <ErrorBox
          onRetry={() => {
            setTaxError(false);
            setTaxTick((value) => value + 1);
          }}
        />
      </>
    );
  }

  if (scope.error) {
    return (
      <>
        {hint}
        <PageHead title={editing ? 'Editar juego' : 'Crear juego personalizado'} sub={sub} />
        <ErrorBox onRetry={scope.reload} />
      </>
    );
  }

  if (!scope.ready) {
    return (
      <>
        {hint}
        <PageHead title={editing ? 'Editar juego' : 'Crear juego personalizado'} sub={sub} />
        <Skeleton rows={6} />
      </>
    );
  }

  if (!editing && scope.noTenants) {
    return (
      <>
        {hint}
        <PageHead title="Crear juego personalizado" sub={sub} />
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

  return (
    <>
      {hint}
      <PageHead title={editing ? 'Editar juego' : 'Crear juego personalizado'} sub={sub} />
      <form id="gf" noValidate onSubmit={(event) => event.preventDefault()}>
        <div id="ferr">
          {errors.length > 0 ? (
            <div className="note bd">
              {errors.map((message) => (
                <div key={message}>{message}</div>
              ))}
            </div>
          ) : null}
        </div>
        {lock ? (
          <div className="note">
            Los datos base (título, requisitos, tamaño, plataformas) los mantiene la plataforma.
            Para cambiarlos, duplica el juego como personalizado.
          </div>
        ) : null}
        {fsec(
          'Información básica',
          <>
            <div className="grid2">
              <Field label="Título">
                <input value={title} disabled={lock} maxLength={90} onChange={(event) => setTitle(event.target.value)} />
              </Field>
              <Field label="Categoría del catálogo">
                <Sel
                  value={categoryId}
                  onChange={setCategoryId}
                  options={(cats ?? []).map((item) => ({ value: item.id, label: item.name }))}
                  ariaLabel="Categoría del catálogo"
                />
              </Field>
            </div>
            <div className="grid3">
              <Field label="Género">
                <Sel
                  value={genreId}
                  onChange={setGenreId}
                  options={(gens ?? []).map((item) => ({ value: item.id, label: item.name }))}
                  emptyLabel="Elegir"
                  ariaLabel="Género"
                  disabled={lock}
                />
              </Field>
              <Field label="Año">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1980}
                  max={2100}
                  value={releaseYear}
                  disabled={lock}
                  onChange={(event) => setReleaseYear(event.target.value)}
                />
              </Field>
              <Field label="Origen">
                <input
                  value={game?.origin === 'BIBLIOTECA' ? 'Biblioteca base' : 'Personalizado'}
                  disabled
                  readOnly
                />
              </Field>
            </div>
            <div className="f">
              <span className="lb">Plataformas (elige una o más)</span>
              <div className="chips">
                {(plats ?? []).map((platform) => (
                  <label className="tg" key={platform.id}>
                    <input
                      type="checkbox"
                      checked={platformIds.includes(platform.id)}
                      disabled={lock}
                      onChange={(event) =>
                        setPlatformIds((prev) =>
                          event.target.checked
                            ? [...prev, platform.id]
                            : prev.filter((id) => id !== platform.id),
                        )
                      }
                    />
                    <span>{platform.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </>,
        )}
        {fsec(
          'Información del juego',
          <>
            <Field label="Descripción">
              <textarea
                value={description}
                maxLength={1200}
                disabled={lock}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <div className="grid2">
              <Field label="Tamaño (GB)">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="0.1"
                  value={sizeValue}
                  disabled={lock}
                  onChange={(event) => setSizeValue(event.target.value)}
                />
              </Field>
            </div>
          </>,
        )}
        {fsec('Requisitos mínimos', specBlock(minReq, setMinReq, lock), !editing || !lock)}
        {fsec(
          'Requisitos recomendados',
          <>
            {lock ? null : (
              <button
                className="btn sm"
                type="button"
                onClick={() => setRecReq({ ...minReq })}
              >
                <AdminIcon name="copy" />
                Copiar mínimos → recomendados
              </button>
            )}
            {specBlock(recReq, setRecReq, lock)}
          </>,
          !editing || !lock,
        )}
        {fsec(
          'Multimedia',
          editing ? (
            <>
              <p className="hint">
                1 portada y hasta 4 screenshots. Se suben a Cloudinary; la base de datos guarda
                solo la referencia.
              </p>
              <div className="slots">
                {mediaSlot(cover, 'COVER', 'Portada', 'cover')}
                {[0, 1, 2, 3].map((index) => {
                  const shot = shots[index] ?? null;
                  return mediaSlot(
                    shot,
                    'SHOT',
                    `Screenshot ${index + 1}`,
                    shot ? `shot-${shot.id}` : `shot-slot-${index}`,
                    shot?.id,
                  );
                })}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={onFileChange}
              />
            </>
          ) : (
            <div className="note">Guarda el juego primero para subir portada y screenshots.</div>
          ),
          true,
          'sec-media',
        )}
        {fsec(
          'Precio',
          <>
            <div className="chips">
              <label className="tg">
                <input
                  type="radio"
                  name="priceMode"
                  checked={priceMode === 'RULE'}
                  onChange={() => setPriceMode('RULE')}
                />
                <span>Usar reglas del negocio</span>
              </label>
              <label className="tg">
                <input
                  type="radio"
                  name="priceMode"
                  checked={priceMode === 'MANUAL'}
                  onChange={() => setPriceMode('MANUAL')}
                />
                <span>Precio manual</span>
              </label>
            </div>
            <p className="hint">
              Según las reglas guardadas: <b>{sug === null ? 'sin regla aplicable' : `${nf(sug)} CUP`}</b>. El precio definitivo lo calcula el backend.
            </p>
            <Field label="Precio manual (CUP)">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={priceMode === 'MANUAL' ? price : ''}
                onChange={(event) => setPrice(event.target.value)}
              />
            </Field>
          </>,
        )}
        {fsec(
          'Publicación',
          <Toggle checked={availability} onChange={setAvailability}>
            Disponible en el catálogo público
          </Toggle>,
        )}
        <div className="sbar">
          <Link className="btn" href={editing ? `/admin/juegos/${gameId}` : '/admin/juegos'}>
            Cancelar
          </Link>
          <button className="btn pri" type="button" disabled={busy} onClick={save}>
            <AdminIcon name="check" />
            Guardar juego
          </button>
        </div>
      </form>
      {removingMedia ? (
        <Modal
          title="Eliminar archivo"
          onClose={() => setRemovingMedia(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setRemovingMedia(null)}>
                Cancelar
              </button>
              <button className="btn dng" type="button" disabled={mediaBusy} onClick={confirmRemoveMedia}>
                Eliminar
              </button>
            </>
          }
        >
          <p>Se quitará la referencia y se pedirá al servidor borrar la imagen en Cloudinary.</p>
        </Modal>
      ) : null}
    </>
  );
}
