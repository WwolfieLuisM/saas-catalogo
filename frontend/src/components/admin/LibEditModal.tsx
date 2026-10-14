'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ApiError } from '@/lib/api/client';
import { adminFetch, adminFetchPaged } from '@/lib/admin/adminApi';
import { slugify } from '@/lib/admin/format';
import {
  deleteLibraryCover,
  deleteLibraryShot,
  fetchLibraryMedia,
  uploadLibraryCover,
  uploadLibraryShot,
} from '@/lib/admin/libraryMediaApi';
import { validateImageFile } from '@/lib/admin/mediaApi';
import { reqFor } from '@/lib/admin/preview';
import { toast } from '@/lib/admin/toast';
import type {
  BaseGameEntry,
  BaseGameStatus,
  GameRequirements,
  LibraryMediaEntry,
  MediaKind,
  TaxonomyItem,
} from '@/lib/admin/types';
import { AdminIcon } from './icons';
import { ArtThumb, Field, Modal } from './ui';

const STATUS_OPTS: Array<{ value: BaseGameStatus; label: string }> = [
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'PENDING_ENRICHMENT', label: 'Pendiente de enriquecer' },
  { value: 'INCOMPLETE', label: 'Incompleto' },
];

const SIZE_UNIT_OPTS = [
  { value: 'MB', label: 'MB' },
  { value: 'GB', label: 'GB' },
  { value: 'TB', label: 'TB' },
];

const CPU_OPTS = [
  'Intel i3',
  'Intel i5',
  'Intel i7',
  'Intel i9',
  'Ryzen 3',
  'Ryzen 5',
  'Ryzen 7',
  'Ryzen 9',
  'Otro',
];
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
}: {
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  emptyLabel?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{emptyLabel ?? '—'}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

type SlotTarget = { kind: MediaKind; replaceId?: string };

function toManifest(rows: LibraryMediaEntry[]): {
  cover: LibraryMediaEntry | null;
  screenshots: LibraryMediaEntry[];
} {
  const cover = rows.find((row) => row.kind === 'COVER') ?? null;
  const screenshots = rows
    .filter((row) => row.kind === 'SHOT')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { cover, screenshots };
}

export function LibEditModal({
  game,
  onClose,
  onSaved,
}: {
  game: BaseGameEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = game !== null;
  const baseGameId = game?.id ?? '';

  const [title, setTitle] = useState(game?.title ?? '');
  const [slug, setSlug] = useState(game?.slug ?? '');
  const [year, setYear] = useState(game?.releaseYear != null ? String(game.releaseYear) : '');
  const [sizeValue, setSizeValue] = useState(game ? String(game.sizeValue) : '10');
  const [sizeUnit, setSizeUnit] = useState<'MB' | 'GB' | 'TB'>(game?.sizeUnit ?? 'GB');
  const [description, setDescription] = useState(game?.description ?? '');
  const [status, setStatus] = useState<BaseGameStatus>(game?.status ?? 'ACTIVE');
  const [source, setSource] = useState(game?.source ?? '');
  const [keywords, setKeywords] = useState(game?.keywords ?? '');
  const [developer, setDeveloper] = useState(game?.developer ?? '');
  const [publisher, setPublisher] = useState(game?.publisher ?? '');
  const [categoryId, setCategoryId] = useState(game?.categoryId ?? '');
  const [genreIds, setGenreIds] = useState<string[]>(game?.genres.map((g) => g.id) ?? []);
  const [platformIds, setPlatformIds] = useState<string[]>(
    game?.platforms.map((p) => p.id) ?? [],
  );

  const sizeNum = parseFloat(sizeValue.replace(',', '.'));
  const sizeGb = sizeUnit === 'MB' ? sizeNum / 1024 : sizeUnit === 'TB' ? sizeNum * 1024 : sizeNum;

  const [minReq, setMinReq] = useState<ReqState>(() =>
    hydrateReq(game?.minimumRequirements, sizeGb || 10),
  );
  const [recReq, setRecReq] = useState<ReqState>(() =>
    hydrateReq(game?.recommendedRequirements, sizeGb || 10),
  );

  const [cats, setCats] = useState<TaxonomyItem[]>([]);
  const [gens, setGens] = useState<TaxonomyItem[]>([]);
  const [plats, setPlats] = useState<TaxonomyItem[]>([]);

  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [manifest, setManifest] = useState<{
    cover: LibraryMediaEntry | null;
    screenshots: LibraryMediaEntry[];
  } | null>(null);
  const [manifestTick, setManifestTick] = useState(0);
  const [uploading, setUploading] = useState<string | null>(null);
  const [pick, setPick] = useState<SlotTarget | null>(null);
  const [removingMedia, setRemovingMedia] = useState<{ kind: MediaKind; id: string } | null>(
    null,
  );
  const [mediaBusy, setMediaBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      Promise.all([
        adminFetchPaged<TaxonomyItem>('/admin/categories', {
          query: { page: 1, limit: 100, sort: 'name', global: true },
        }),
        adminFetchPaged<TaxonomyItem>('/admin/genres', {
          query: { page: 1, limit: 100, sort: 'name', global: true },
        }),
        adminFetchPaged<TaxonomyItem>('/admin/platforms', {
          query: { page: 1, limit: 100, sort: 'name', global: true },
        }),
      ])
        .then(([catRows, genRows, platRows]) => {
          if (cancelled) return;
          setCats(catRows.data);
          setGens(genRows.data);
          setPlats(platRows.data);
        })
        .catch(() => {
          if (!cancelled) {
            setCats([]);
            setGens([]);
            setPlats([]);
          }
        });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!baseGameId) return;
    let cancelled = false;
    queueMicrotask(() => {
      fetchLibraryMedia(baseGameId)
        .then((rows) => {
          if (!cancelled) setManifest(toManifest(rows));
        })
        .catch(() => {
          if (!cancelled) setManifest(null);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [baseGameId, manifestTick]);

  const openPick = (kind: MediaKind, replaceId?: string) => {
    if (!baseGameId || uploading) return;
    setPick({ kind, replaceId });
    fileRef.current?.click();
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !pick || !baseGameId) return;
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
        ? uploadLibraryCover(baseGameId, file)
        : (async () => {
            if (target.replaceId) await deleteLibraryShot(baseGameId, target.replaceId);
            await uploadLibraryShot(baseGameId, file);
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
    if (!removingMedia || !baseGameId || mediaBusy) return;
    setMediaBusy(true);
    const run =
      removingMedia.kind === 'COVER'
        ? deleteLibraryCover(baseGameId)
        : deleteLibraryShot(baseGameId, removingMedia.id);
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

  const submit = () => {
    if (busy) return;
    const cleanTitle = title.trim();
    const cleanSlug = slug.trim() || slugify(cleanTitle);
    const yearNum = parseInt(year, 10);
    const nextErrors: string[] = [];
    if (cleanTitle.length < 2 || cleanTitle.length > 150) nextErrors.push('Escribe el título.');
    if (!(sizeNum > 0)) nextErrors.push('El tamaño debe ser mayor que 0.');
    setErrors(nextErrors);
    if (nextErrors.length > 0) {
      toast('Revisa los campos marcados', 'bd');
      return;
    }

    const payload: Record<string, unknown> = {
      title: cleanTitle,
      slug: cleanSlug,
      sizeValue: sizeNum,
      sizeUnit,
      description: description.trim() || null,
      status,
      source: source.trim() || null,
      keywords: keywords.trim() || null,
      developer: developer.trim() || null,
      publisher: publisher.trim() || null,
      categoryId: categoryId || null,
      genreIds,
      platformIds,
      minimumRequirements: reqBody(minReq),
      recommendedRequirements: reqBody(recReq),
    };
    if (Number.isFinite(yearNum)) payload.releaseYear = yearNum;

    setBusy(true);
    if (editing && game) {
      adminFetch(`/admin/base-games/${game.id}`, { method: 'PATCH', body: payload })
        .then(() => {
          toast('Biblioteca actualizada');
          onSaved();
          onClose();
        })
        .catch((cause: unknown) => {
          toast(cause instanceof ApiError ? cause.message : 'No se pudo guardar', 'bd');
          setBusy(false);
        });
      return;
    }

    const defaults = reqFor(sizeNum);
    adminFetch<BaseGameEntry>('/admin/base-games', {
      method: 'POST',
      body: {
        ...payload,
        minimumRequirements: payload.minimumRequirements ?? defaults.min,
        recommendedRequirements: payload.recommendedRequirements ?? defaults.rec,
      },
    })
      .then(() => {
        toast('Ficha creada en la biblioteca');
        onSaved();
        onClose();
      })
      .catch((cause: unknown) => {
        toast(cause instanceof ApiError ? cause.message : 'No se pudo guardar', 'bd');
        setBusy(false);
      });
  };

  const specBlock = (req: ReqState, setReq: (next: ReqState) => void) => {
    const patch = (part: Partial<ReqState>) => setReq({ ...req, ...part });
    return (
      <div className="grid2">
        <Field label="Procesador">
          <Sel
            value={req.cpu}
            onChange={(cpu) => patch({ cpu })}
            options={strOpts(CPU_OPTS)}
            ariaLabel="Procesador"
          />
        </Field>
        <Field label="Modelo CPU (opcional)">
          <input
            value={req.cpuModel}
            placeholder="Ej. 4590"
            onChange={(event) => patch({ cpuModel: event.target.value })}
          />
        </Field>
        <Field label="RAM">
          <Sel
            value={req.ram}
            onChange={(ram) => patch({ ram })}
            options={RAM_OPTS.map((n) => ({ value: String(n), label: `${n} GB` }))}
            ariaLabel="RAM"
          />
        </Field>
        <Field label="Gráficos">
          <Sel
            value={req.gpu}
            onChange={(gpu) => patch({ gpu })}
            options={strOpts(GPU_OPTS)}
            ariaLabel="Gráficos"
          />
        </Field>
        <Field label="Modelo GPU (opcional)">
          <input
            value={req.gpuModel}
            placeholder="Ej. 1050 Ti"
            onChange={(event) => patch({ gpuModel: event.target.value })}
          />
        </Field>
        <Field label="DirectX">
          <Sel
            value={req.dx}
            onChange={(dx) => patch({ dx })}
            options={DX_OPTS.map((n) => ({ value: String(n), label: `DirectX ${n}` }))}
            ariaLabel="DirectX"
          />
        </Field>
        <Field label="Sistema operativo">
          <Sel
            value={req.os}
            onChange={(os) => patch({ os })}
            options={strOpts(OS_OPTS)}
            ariaLabel="Sistema operativo"
          />
        </Field>
        <Field label="Almacenamiento">
          <Sel
            value={req.storage}
            onChange={(storage) => patch({ storage })}
            options={strOpts(STORAGE_OPTS)}
            ariaLabel="Almacenamiento"
          />
        </Field>
      </div>
    );
  };

  const cover = manifest?.cover ?? null;
  const shots = manifest?.screenshots ?? [];

  const statusSuffix = (key: string, mediaStatus?: string) => {
    if (uploading === key) return ' (subiendo)';
    if (!mediaStatus || mediaStatus === 'OK') return '';
    return mediaStatus === 'PENDING' ? ' (subiendo)' : ' (error)';
  };

  const mediaSlot = (
    entry: LibraryMediaEntry | null,
    kind: MediaKind,
    label: string,
    key: string,
    replaceId?: string,
  ) => (
    <div className={`slot${kind === 'COVER' ? ' cv' : ''}`}>
      {entry?.url ? (
        <ArtThumb title={title || label} url={entry.url} />
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

  return (
    <>
      <Modal
        title={editing ? 'Editar ficha de biblioteca' : 'Nueva ficha de biblioteca'}
        wide
        onClose={onClose}
        footer={
          <>
            <button className="btn" type="button" onClick={onClose} disabled={busy}>
              Cancelar
            </button>
            <button className="btn pri" type="button" onClick={submit} disabled={busy}>
              <AdminIcon name="check" />
              Guardar
            </button>
          </>
        }
      >
        {errors.length > 0 ? (
          <div className="note bd">
            {errors.map((message) => (
              <div key={message}>{message}</div>
            ))}
          </div>
        ) : null}
        <div className="grid2">
          <Field label="Título">
            <input
              value={title}
              maxLength={150}
              onChange={(event) => setTitle(event.target.value)}
            />
          </Field>
          <Field label="Slug">
            <input value={slug} maxLength={50} onChange={(event) => setSlug(event.target.value)} />
          </Field>
          <Field label="Año">
            <input
              type="number"
              min={1970}
              max={2100}
              value={year}
              onChange={(event) => setYear(event.target.value)}
            />
          </Field>
          <Field label="Estado">
            <select
              aria-label="Estado"
              value={status}
              onChange={(event) => setStatus(event.target.value as BaseGameStatus)}
            >
              {STATUS_OPTS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tamaño">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px', gap: 8 }}>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={sizeValue}
                onChange={(event) => setSizeValue(event.target.value)}
              />
              <select
                aria-label="Unidad de tamaño"
                value={sizeUnit}
                onChange={(event) => setSizeUnit(event.target.value as 'MB' | 'GB' | 'TB')}
              >
                {SIZE_UNIT_OPTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </Field>
          <Field label="Categoría">
            <select
              aria-label="Categoría"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">Sin categoría</option>
              {cats.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Descripción">
          <textarea
            value={description}
            maxLength={1200}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="grid2">
          <Field label="Desarrollador">
            <input
              value={developer}
              maxLength={120}
              onChange={(event) => setDeveloper(event.target.value)}
            />
          </Field>
          <Field label="Publisher">
            <input
              value={publisher}
              maxLength={120}
              onChange={(event) => setPublisher(event.target.value)}
            />
          </Field>
          <Field label="Fuente">
            <input
              value={source}
              maxLength={120}
              placeholder="Ej. IGDB, manual"
              onChange={(event) => setSource(event.target.value)}
            />
          </Field>
          <Field label="Palabras clave">
            <input
              value={keywords}
              maxLength={300}
              placeholder="separadas por comas"
              onChange={(event) => setKeywords(event.target.value)}
            />
          </Field>
        </div>
        <div className="f">
          <span className="lb">Géneros (una o más)</span>
          <div className="chips">
            {gens.map((genre) => (
              <label className="tg" key={genre.id}>
                <input
                  type="checkbox"
                  checked={genreIds.includes(genre.id)}
                  onChange={(event) =>
                    setGenreIds((prev) =>
                      event.target.checked
                        ? [...prev, genre.id]
                        : prev.filter((id) => id !== genre.id),
                    )
                  }
                />
                <span>{genre.name}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="f">
          <span className="lb">Plataformas (una o más)</span>
          <div className="chips">
            {plats.map((platform) => (
              <label className="tg" key={platform.id}>
                <input
                  type="checkbox"
                  checked={platformIds.includes(platform.id)}
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
        <details className="fs" open>
          <summary>
            Requisitos mínimos
            <AdminIcon name="chev" />
          </summary>
          <div className="fb">{specBlock(minReq, setMinReq)}</div>
        </details>
        <details className="fs" open>
          <summary>
            Requisitos recomendados
            <AdminIcon name="chev" />
          </summary>
          <div className="fb">
            <button
              className="btn sm"
              type="button"
              style={{ marginBottom: 12 }}
              onClick={() => setRecReq({ ...minReq })}
            >
              <AdminIcon name="copy" />
              Copiar mínimos → recomendados
            </button>
            {specBlock(recReq, setRecReq)}
          </div>
        </details>
        {editing ? (
          <details className="fs" open>
            <summary>
              Multimedia
              <AdminIcon name="chev" />
            </summary>
            <div className="fb">
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
            </div>
          </details>
        ) : (
          <p className="hint">Guarda la ficha para subir portada y screenshots.</p>
        )}
      </Modal>
      {removingMedia ? (
        <Modal
          title="Eliminar archivo"
          onClose={() => setRemovingMedia(null)}
          footer={
            <>
              <button className="btn" type="button" onClick={() => setRemovingMedia(null)}>
                Cancelar
              </button>
              <button
                className="btn dng"
                type="button"
                disabled={mediaBusy}
                onClick={confirmRemoveMedia}
              >
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
