'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useFeed } from '@/hooks/useFeed';
import { loadFabPos, saveFabPos } from '@/lib/feed/storage';

const EDGE = 12;
const SIZE = 58;

export function ListFab() {
  const { list, openDialog } = useFeed();
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef({ active: false, moved: false, sx: 0, sy: 0, x: 0, y: 0 });

  const clamp = useCallback((x: number, y: number) => {
    const maxX = window.innerWidth - SIZE - EDGE;
    const maxY = window.innerHeight - SIZE - EDGE - (window.visualViewport?.height ? 0 : 0);
    return {
      x: Math.min(Math.max(EDGE, x), maxX),
      y: Math.min(Math.max(EDGE, y), maxY),
    };
  }, []);

  useEffect(() => {
    const pos = loadFabPos();
    const el = ref.current;
    if (!el) return;
    if (pos) {
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      el.style.bottom = 'auto';
      el.style.right = 'auto';
    }
    const onResize = () => {
      if (!pos) return;
      const c = clamp(pos.x, pos.y);
      el.style.left = `${c.x}px`;
      el.style.top = `${c.y}px`;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const rect = el.getBoundingClientRect();
    drag.current = {
      active: true,
      moved: false,
      sx: e.clientX,
      sy: e.clientY,
      x: rect.left,
      y: rect.top,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    const el = ref.current;
    if (!el) return;
    const dx = e.clientX - drag.current.sx;
    const dy = e.clientY - drag.current.sy;
    if (!drag.current.moved && Math.hypot(dx, dy) < 6) return;
    drag.current.moved = true;
    el.classList.add('dragging');
    const c = clamp(drag.current.x + dx, drag.current.y + dy);
    el.style.left = `${c.x}px`;
    el.style.top = `${c.y}px`;
    el.style.bottom = 'auto';
    el.style.right = 'auto';
  };

  const endDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag.current.active) return;
    const el = ref.current;
    drag.current.active = false;
    el?.classList.remove('dragging');
    if (drag.current.moved && el) {
      const rect = el.getBoundingClientRect();
      saveFabPos({ x: rect.left, y: rect.top });
      // suppress click after drag
      e.preventDefault();
    }
  };

  const onClick = () => {
    if (drag.current.moved) {
      drag.current.moved = false;
      return;
    }
    openDialog('cart');
  };

  return (
    <button
      ref={ref}
      className="list-fab show"
      type="button"
      aria-label={`Abrir tu lista (${list.length} juegos)`}
      title="Tu lista"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 6h13M8 12h13M8 18h13" />
        <path d="M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
      <span className="fab-badge" hidden={!list.length}>
        {list.length}
      </span>
    </button>
  );
}
