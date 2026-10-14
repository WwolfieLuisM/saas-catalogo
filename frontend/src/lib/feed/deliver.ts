import { fmt, gb } from './format.ts';
import type { FeedGame } from '@/types/feed';

export const listMessage = (games: FeedGame[]): string => {
  const total = games.reduce((a, g) => a + (g.price ?? 0), 0);
  return `Hola Javier, quiero estos juegos:\n${games
    .map((g) => `- ${g.name} (${fmt(g.price ?? 0)} CUP, ${gb(g.sizeGb)} GB)`)
    .join('\n')}\nTotal: ${fmt(total)} CUP`;
};

export interface WhatsappSource {
  whatsapp: string;
  phone: string;
}

export const whatsappTarget = (settings: WhatsappSource | null | undefined): string =>
  (settings?.whatsapp || settings?.phone || '').replace(/\D/g, '');

export const deliver = async (
  text: string,
  whatsapp: string,
): Promise<'whatsapp' | 'clipboard' | 'fallback' | 'none'> => {
  if (typeof window === 'undefined') return 'none';
  const digits = whatsapp.replace(/\D/g, '');
  if (digits) {
    window.open(
      `https://wa.me/${digits}?text=${encodeURIComponent(text)}`,
      '_blank',
      'noopener',
    );
    return 'whatsapp';
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'clipboard';
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return 'fallback';
    } catch {
      return 'none';
    }
  }
};
