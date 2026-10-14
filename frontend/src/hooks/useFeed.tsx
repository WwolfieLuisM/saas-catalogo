'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  FeedGame,
  FeedCatalog,
  GameStatus,
  SortKey,
  CollectionFilter,
  FeedFacets,
} from '@/types/feed';
import { getCatalog, getCatalogVersion, getTenantSettings } from '@/lib/api/catalogApi';
import type { TenantPublicSettings } from '@/types/catalog';
import { normalizeCatalog } from '@/lib/feed/normalize';
import { buildFacets } from '@/lib/feed/facets';
import { filterGames } from '@/lib/feed/filter';
import { demoCatalog } from '@/lib/feed/demo';
import {
  loadListIds,
  saveListIds,
  loadFavoriteIds,
  saveFavoriteIds,
  loadStatusMap,
  saveStatusMap,
  readCatalogCache,
  writeCatalogCache,
  isCacheExpired,
  type CatalogCacheEntry,
} from '@/lib/feed/storage';

export const PAGE_SIZE = 24;
const POLL_MS = 60_000;

export type DialogKind = 'cart' | 'favorites' | 'collection' | 'welcome' | null;

interface FeedState {
  games: FeedGame[];
  catalogVersion: number | null;
  updatedAt: string | null;
  ready: boolean;
  catalogLoading: boolean;
  loadError: string | null;
  stale: boolean;
  q: string;
  cat: string;
  genre: string;
  platform: string;
  maxPrice: number | null;
  sort: SortKey;
  visible: number;
  list: string[];
  favorites: string[];
  status: Record<string, GameStatus>;
  heroId: string | null;
  detailId: string | null;
  dialog: DialogKind;
  collectionFilter: CollectionFilter;
  toastMsg: string | null;
  sidebarOpen: boolean;
  scrolledDown: boolean;
  showFilters: boolean;
  showWelcome: boolean;
  facets: FeedFacets;
  filtered: FeedGame[];
  settings: TenantPublicSettings | null;
}

interface FeedActions {
  setQ: (q: string) => void;
  setCat: (cat: string) => void;
  setGenre: (genre: string) => void;
  setPlatform: (platform: string) => void;
  setMaxPrice: (maxPrice: number | null) => void;
  setSort: (sort: SortKey) => void;
  more: () => void;
  resetFilters: () => void;
  toggleShowFilters: () => void;
  toggleList: (id: string) => void;
  removeFromList: (id: string) => void;
  clearList: () => void;
  toggleFavorite: (id: string) => void;
  removeFavorite: (id: string) => void;
  setStatus: (id: string, status: GameStatus | undefined) => void;
  setHero: (id: string) => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  openDialog: (d: Exclude<DialogKind, null>) => void;
  closeDialog: () => void;
  setCollectionFilter: (f: CollectionFilter) => void;
  toast: (msg: string) => void;
  setSidebarOpen: (open: boolean) => void;
  setShowWelcome: (open: boolean) => void;
  retryLoad: () => void;
}

export type FeedContextValue = FeedState & FeedActions;

const FeedContext = createContext<FeedContextValue | null>(null);

export function FeedProvider({ children }: { children: React.ReactNode }) {
  const [games, setGames] = useState<FeedGame[]>([]);
  const [catalogVersion, setCatalogVersion] = useState<number | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [q, setQState] = useState('');
  const [cat, setCatState] = useState('');
  const [genre, setGenreState] = useState('');
  const [platform, setPlatformState] = useState('');
  const [maxPrice, setMaxPriceState] = useState<number | null>(null);
  const [sort, setSortState] = useState<SortKey>('recent');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [list, setList] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [status, setStatusState] = useState<Record<string, GameStatus>>({});
  const [heroId, setHeroId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [collectionFilter, setCollectionFilterState] = useState<CollectionFilter>('all');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrolledDown, setScrolledDown] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [settings, setSettings] = useState<TenantPublicSettings | null>(null);

  const etagRef = useRef<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const priceTouchedRef = useRef(false);
  const readyRef = useRef(false);
  const versionRef = useRef<number | null>(null);

  const facets = useMemo(() => buildFacets(games), [games]);
  const filtered = useMemo(
    () => filterGames(games, { q, cat, genre, platform, maxPrice, sort }),
    [games, q, cat, genre, platform, maxPrice, sort],
  );

  const applyCatalogStable = useCallback((catData: FeedCatalog) => {
    const f = buildFacets(catData.games);
    setGames(catData.games);
    setCatalogVersion(catData.catalogVersion);
    versionRef.current = catData.catalogVersion;
    setUpdatedAt(catData.updatedAt);
    setReady(true);
    readyRef.current = true;
    setCatalogLoading(false);
    setLoadError(null);
    setStale(false);
    setMaxPriceState((prev) =>
      priceTouchedRef.current && prev !== null && prev <= f.maxPriceAll ? prev : null,
    );
    setHeroId((prev) => {
      if (prev && catData.games.some((g) => g.id === prev)) return prev;
      return catData.games[0]?.id ?? null;
    });
  }, []);

  const applyFromCache = useCallback(
    (entry: CatalogCacheEntry) => {
      try {
        const cat = normalizeCatalog({
          version: entry.catalogVersion,
          updatedAt: entry.updatedAt,
          games: entry.data.games,
        });
        applyCatalogStable(cat);
      } catch {
        /* ignore invalid cache */
      }
    },
    [applyCatalogStable],
  );

  const loadFresh = useCallback(async () => {
    setCatalogLoading(true);
    try {
      if (process.env.NEXT_PUBLIC_DEMO === 'true') {
        const cat = demoCatalog();
        applyCatalogStable(cat);
        writeCatalogCache(cat.catalogVersion, cat.updatedAt, cat.games);
        return;
      }
      const res = await getCatalog(etagRef.current);
      if (res.notModified) {
        setStale(false);
        setCatalogLoading(false);
        return;
      }
      if (res.data) {
        etagRef.current = res.etag;
        const cat = normalizeCatalog(res.data);
        applyCatalogStable(cat);
        writeCatalogCache(cat.catalogVersion, cat.updatedAt, cat.games);
        return;
      }
      throw new Error('Respuesta de catálogo sin datos');
    } catch (err) {
      const cache = readCatalogCache();
      if (cache) {
        applyFromCache(cache);
        setStale(true);
        setCatalogLoading(false);
      } else if (!readyRef.current) {
        setLoadError(err instanceof Error ? err.message : 'No pudimos cargar el catálogo.');
        setReady(true);
        readyRef.current = true;
        setCatalogLoading(false);
      } else {
        setCatalogLoading(false);
      }
    }
  }, [applyCatalogStable, applyFromCache]);

  const checkVersion = useCallback(async () => {
    if (process.env.NEXT_PUBLIC_DEMO === 'true') {
      const cache = readCatalogCache();
      if (!cache || isCacheExpired(cache)) {
        await loadFresh();
      } else {
        applyFromCache(cache);
        setStale(false);
        setCatalogLoading(false);
      }
      return;
    }
    try {
      const cache = readCatalogCache();
      const needsFull = !readyRef.current || !cache || isCacheExpired(cache);
      if (needsFull) {
        await loadFresh();
        return;
      }
      const vRes = await getCatalogVersion();
      if (vRes.data && Number(vRes.data.version) !== versionRef.current) {
        await loadFresh();
      } else {
        applyFromCache(cache);
        setStale(false);
        setCatalogLoading(false);
      }
    } catch (err) {
      const cache = readCatalogCache();
      if (cache) {
        applyFromCache(cache);
        setStale(true);
        setCatalogLoading(false);
      } else if (!readyRef.current) {
        setLoadError(err instanceof Error ? err.message : 'No pudimos cargar el catálogo.');
        setReady(true);
        readyRef.current = true;
        setCatalogLoading(false);
      } else {
        setCatalogLoading(false);
      }
    }
  }, [loadFresh, applyFromCache]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void checkVersion();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready) return;
    const start = () => {
      if (pollTimerRef.current) return;
      pollTimerRef.current = setInterval(() => {
        if (typeof document !== 'undefined' && !document.hidden) void checkVersion();
      }, POLL_MS);
    };
    const stop = () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    start();
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        void checkVersion();
        start();
      }
    };
    const onOnline = () => {
      void checkVersion();
      start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [ready, checkVersion]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setList(loadListIds());
      setFavorites(loadFavoriteIds());
      setStatusState(loadStatusMap());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (process.env.NEXT_PUBLIC_DEMO === 'true') return;
    queueMicrotask(() => {
      if (cancelled) return;
      void getTenantSettings()
        .then((res) => {
          if (!cancelled && res.data) setSettings(res.data);
        })
        .catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolledDown((prev) => {
        if (y > 60) return true;
        if (y < 24) return false;
        return prev;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const setQ = useCallback((v: string) => {
    setQState(v);
    setVisible(PAGE_SIZE);
  }, []);
  const setCat = useCallback((v: string) => {
    setCatState(v);
    setVisible(PAGE_SIZE);
  }, []);
  const setGenre = useCallback((v: string) => {
    setGenreState(v);
    setVisible(PAGE_SIZE);
  }, []);
  const setPlatform = useCallback((v: string) => {
    setPlatformState(v);
    setVisible(PAGE_SIZE);
  }, []);
  const setMaxPrice = useCallback((v: number | null) => {
    priceTouchedRef.current = true;
    setMaxPriceState(v);
    setVisible(PAGE_SIZE);
  }, []);
  const setSort = useCallback((v: SortKey) => {
    setSortState(v);
    setVisible(PAGE_SIZE);
  }, []);
  const more = useCallback(() => setVisible((s) => s + PAGE_SIZE), []);
  const resetFilters = useCallback(() => {
    setQState('');
    setCatState('');
    setGenreState('');
    setPlatformState('');
    priceTouchedRef.current = false;
    setMaxPriceState(null);
    setVisible(PAGE_SIZE);
  }, []);
  const toggleShowFilters = useCallback(() => setShowFilters((s) => !s), []);

  const toggleList = useCallback((id: string) => {
    setList((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveListIds(next);
      return next;
    });
  }, []);
  const removeFromList = useCallback((id: string) => {
    setList((prev) => {
      const next = prev.filter((x) => x !== id);
      saveListIds(next);
      return next;
    });
  }, []);
  const clearList = useCallback(() => {
    setList(() => {
      saveListIds([]);
      return [];
    });
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveFavoriteIds(next);
      return next;
    });
  }, []);
  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = prev.filter((x) => x !== id);
      saveFavoriteIds(next);
      return next;
    });
  }, []);

  const setStatus = useCallback((id: string, s: GameStatus | undefined) => {
    setStatusState((prev) => {
      const next = { ...prev };
      if (s === undefined) delete next[id];
      else next[id] = s;
      saveStatusMap(next);
      return next;
    });
  }, []);

  const openDetail = useCallback((id: string) => setDetailId(id), []);
  const closeDetail = useCallback(() => setDetailId(null), []);
  const openDialog = useCallback((d: Exclude<DialogKind, null>) => setDialog(d), []);
  const closeDialog = useCallback(() => setDialog(null), []);

  const value: FeedContextValue = {
    games,
    catalogVersion,
    updatedAt,
    ready,
    catalogLoading,
    loadError,
    stale,
    q,
    cat,
    genre,
    platform,
    maxPrice,
    sort,
    visible,
    list,
    favorites,
    status,
    heroId,
    detailId,
    dialog,
    collectionFilter,
    toastMsg,
    sidebarOpen,
    scrolledDown,
    showFilters,
    showWelcome,
    facets,
    filtered,
    settings,
    setQ,
    setCat,
    setGenre,
    setPlatform,
    setMaxPrice,
    setSort,
    more,
    resetFilters,
    toggleShowFilters,
    toggleList,
    removeFromList,
    clearList,
    toggleFavorite,
    removeFavorite,
    setStatus,
    setHero: setHeroId,
    openDetail,
    closeDetail,
    openDialog,
    closeDialog,
    setCollectionFilter: setCollectionFilterState,
    toast,
    setSidebarOpen,
    setShowWelcome,
    retryLoad: () => {
      setLoadError(null);
      setReady(false);
      readyRef.current = false;
      setCatalogLoading(true);
      void checkVersion();
    },
  };

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed(): FeedContextValue {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error('useFeed must be used within FeedProvider');
  return ctx;
}
