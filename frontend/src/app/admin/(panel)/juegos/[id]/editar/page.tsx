'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { adminFetch } from '@/lib/admin/adminApi';
import type { GameItem } from '@/lib/admin/types';
import { ErrorBox, NotFoundBox, Skeleton } from '@/components/admin/ui';
import { GameForm } from '@/components/admin/GameForm';

export default function EditarJuegoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [game, setGame] = useState<GameItem | null>(null);
  const [failed, setFailed] = useState<'none' | 'missing' | 'error'>('none');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setGame(null);
      setFailed('none');
      adminFetch<GameItem>(`/admin/games/${id}`)
        .then((row) => {
          if (!cancelled) setGame(row);
        })
        .catch((cause: unknown) => {
          if (cancelled) return;
          setFailed(cause instanceof ApiError && cause.status === 404 ? 'missing' : 'error');
        });
    });
    return () => {
      cancelled = true;
    };
  }, [id, tick]);

  if (failed === 'missing') return <NotFoundBox />;
  if (failed === 'error') return <ErrorBox onRetry={() => setTick((value) => value + 1)} />;
  if (!game) return <Skeleton rows={6} />;
  return <GameForm game={game} />;
}
