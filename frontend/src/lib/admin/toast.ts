export interface ToastItem {
  id: number;
  text: string;
  kind: string;
}

const EMPTY: ToastItem[] = [];
let items: ToastItem[] = EMPTY;
let seq = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function toast(text: string, kind = ''): void {
  seq += 1;
  const item: ToastItem = { id: seq, text, kind };
  items = [...items, item];
  emit();
  setTimeout(() => {
    items = items.filter((existing) => existing.id !== item.id);
    emit();
  }, 3600);
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): ToastItem[] {
  return items;
}

export function getServerToasts(): ToastItem[] {
  return EMPTY;
}
